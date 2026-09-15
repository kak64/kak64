import { readFile } from "node:fs/promises";
import path from "node:path";
import { exists } from "./files";
import type { MaterialData, MeshData } from "./mesh";

export interface ObjResult {
  meshes: MeshData[];
  materials: MaterialData[];
  mtlFiles: string[];
}

export interface MtlEntry {
  name: string;
  kd?: [number, number, number];
  d?: number;
  ns?: number;
  mapKd?: string;
  mapBump?: string;
  mapKs?: string;
  mapNs?: string;
  mapD?: string;
  mapPr?: string;
  mapPm?: string;
}

export function parseMtl(text: string): MtlEntry[] {
  const out: MtlEntry[] = [];
  let cur: MtlEntry | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const key = (parts[0] ?? "").toLowerCase();
    const rest = parts.slice(1);
    const value = rest.join(" ");
    // Texture map lines may carry options (-bm 1, -s 1 1 1); the path is the final token.
    const mapPath = () => rest.filter((t) => !t.startsWith("-")).slice(-1)[0] ?? value;
    switch (key) {
      case "newmtl": cur = { name: value }; out.push(cur); break;
      case "kd": if (cur) cur.kd = [Number(rest[0]) || 0, Number(rest[1]) || 0, Number(rest[2]) || 0]; break;
      case "d": if (cur) cur.d = Number(rest[0]); break;
      case "tr": if (cur) cur.d = 1 - (Number(rest[0]) || 0); break;
      case "ns": if (cur) cur.ns = Number(rest[0]); break;
      case "map_kd": if (cur) cur.mapKd = mapPath(); break;
      case "map_bump": case "bump": case "norm": if (cur) cur.mapBump = mapPath(); break;
      case "map_ks": if (cur) cur.mapKs = mapPath(); break;
      case "map_ns": if (cur) cur.mapNs = mapPath(); break;
      case "map_d": if (cur) cur.mapD = mapPath(); break;
      case "map_pr": if (cur) cur.mapPr = mapPath(); break;
      case "map_pm": if (cur) cur.mapPm = mapPath(); break;
      default: break;
    }
  }
  return out;
}

/**
 * Parse Wavefront OBJ text into per-material meshes: faces are triangulated with a fan,
 * negative indices are resolved, and vertices are de-duplicated per v/vt/vn tuple.
 * UVs are flipped to the glTF convention (V down).
 */
export function parseObj(text: string): { meshes: MeshData[]; mtllib: string[]; materialNames: string[] } {
  const v: number[] = [];
  const vt: number[] = [];
  const vn: number[] = [];
  const mtllib: string[] = [];
  interface Group { name: string; material: string; map: Map<string, number>; pos: number[]; uv: number[]; nrm: number[]; idx: number[]; hasUv: boolean; hasN: boolean }
  const groups = new Map<string, Group>();
  let material = "default";
  let objectName = "mesh";
  const getGroup = () => {
    const key = `${objectName}|${material}`;
    let g = groups.get(key);
    if (!g) {
      g = { name: objectName, material, map: new Map(), pos: [], uv: [], nrm: [], idx: [], hasUv: false, hasN: false };
      groups.set(key, g);
    }
    return g;
  };
  const resolve = (i: number, count: number) => (i < 0 ? count + i : i - 1);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sp = line.indexOf(" ");
    const key = sp === -1 ? line : line.slice(0, sp);
    const rest = sp === -1 ? "" : line.slice(sp + 1).trim();
    switch (key) {
      case "v": {
        const p = rest.split(/\s+/).map(Number);
        v.push(p[0] || 0, p[1] || 0, p[2] || 0);
        break;
      }
      case "vt": {
        const p = rest.split(/\s+/).map(Number);
        vt.push(p[0] || 0, p[1] || 0);
        break;
      }
      case "vn": {
        const p = rest.split(/\s+/).map(Number);
        vn.push(p[0] || 0, p[1] || 0, p[2] || 0);
        break;
      }
      case "o": case "g": objectName = rest || objectName; break;
      case "usemtl": material = rest || "default"; break;
      case "mtllib": mtllib.push(...rest.split(/\s+/).filter(Boolean)); break;
      case "f": {
        const g = getGroup();
        const verts = rest.split(/\s+/).filter(Boolean);
        const ids: number[] = [];
        for (const tok of verts) {
          let id = g.map.get(tok);
          if (id === undefined) {
            const bits = tok.split("/");
            const pi = resolve(Number(bits[0]), v.length / 3);
            g.pos.push(v[pi * 3] ?? 0, v[pi * 3 + 1] ?? 0, v[pi * 3 + 2] ?? 0);
            if (bits[1]) {
              const t = resolve(Number(bits[1]), vt.length / 2);
              g.uv.push(vt[t * 2] ?? 0, 1 - (vt[t * 2 + 1] ?? 0));
              g.hasUv = true;
            } else g.uv.push(0, 0);
            if (bits[2]) {
              const nidx = resolve(Number(bits[2]), vn.length / 3);
              g.nrm.push(vn[nidx * 3] ?? 0, vn[nidx * 3 + 1] ?? 0, vn[nidx * 3 + 2] ?? 1);
              g.hasN = true;
            } else g.nrm.push(0, 0, 1);
            id = g.pos.length / 3 - 1;
            g.map.set(tok, id);
          }
          ids.push(id);
        }
        for (let i = 1; i + 1 < ids.length; i++) g.idx.push(ids[0]!, ids[i]!, ids[i + 1]!);
        break;
      }
      default: break;
    }
  }
  const meshes: MeshData[] = [];
  const materialNames = new Set<string>();
  for (const g of groups.values()) {
    if (!g.idx.length) continue;
    materialNames.add(g.material);
    meshes.push({
      name: g.name,
      material: g.material,
      positions: new Float32Array(g.pos),
      uvs: g.hasUv ? new Float32Array(g.uv) : undefined,
      normals: g.hasN ? new Float32Array(g.nrm) : undefined,
      indices: new Uint32Array(g.idx),
    });
  }
  return { meshes, mtllib, materialNames: [...materialNames] };
}

async function findFile(dir: string, name: string): Promise<string | undefined> {
  const unified = name.replace(/\\/g, "/");
  for (const c of [path.join(dir, unified), path.join(dir, path.posix.basename(unified))]) {
    if (await exists(c)) return c;
  }
  return undefined;
}

/** Load an OBJ file, resolving its MTL library and texture files from the same directory. */
export async function loadObj(file: string, extraDirs: string[] = []): Promise<ObjResult> {
  const text = await readFile(file, "utf8");
  const parsed = parseObj(text);
  const dirs = [path.dirname(file), ...extraDirs];
  const mtl: MtlEntry[] = [];
  const mtlFiles: string[] = [];
  for (const lib of parsed.mtllib) {
    for (const d of dirs) {
      const f = await findFile(d, lib);
      if (f) {
        mtlFiles.push(f);
        mtl.push(...parseMtl(await readFile(f, "utf8")));
        break;
      }
    }
  }
  const tex = async (p?: string) => {
    if (!p) return undefined;
    for (const d of dirs) {
      const f = await findFile(d, p);
      if (f) return { file: f, name: path.basename(f).replace(/\.[^.]+$/, "") };
    }
    return undefined;
  };
  const materials: MaterialData[] = [];
  for (const name of parsed.materialNames) {
    const m = mtl.find((x) => x.name === name);
    const kd = m?.kd ?? [0.8, 0.8, 0.8];
    const ns = m?.ns ?? 10;
    materials.push({
      name,
      baseColor: [kd[0]!, kd[1]!, kd[2]!, m?.d ?? 1],
      metallic: m?.mapPm ? 1 : 0,
      roughness: Math.max(0.05, Math.min(1, 1 - Math.sqrt(Math.min(ns, 1000) / 1000))),
      diffuse: await tex(m?.mapKd),
      normal: await tex(m?.mapBump),
      specular: await tex(m?.mapKs ?? m?.mapNs),
      roughnessMap: await tex(m?.mapPr),
      metalnessMap: await tex(m?.mapPm),
      alpha: (m?.d ?? 1) < 1 || !!m?.mapD,
    });
  }
  return { meshes: parsed.meshes, materials, mtlFiles };
}
