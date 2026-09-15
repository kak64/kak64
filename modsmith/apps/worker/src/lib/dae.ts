import { readFile } from "node:fs/promises";
import path from "node:path";
import { exists } from "./files";
import type { MaterialData, MeshData } from "./mesh";
import { child, children, findAll, findFirst, parseXml, type XmlNode } from "./xml";

/**
 * Minimal COLLADA (.dae) importer: reads library_geometries triangles/polylist/polygons
 * with POSITION/NORMAL/TEXCOORD inputs, resolves diffuse textures through effects,
 * applies visual-scene node matrices and converts to Y-up metres (glTF convention).
 */
export async function loadDae(file: string): Promise<{ meshes: MeshData[]; materials: MaterialData[] }> {
  const text = await readFile(file, "utf8");
  return parseDaeText(text, path.dirname(file));
}

export async function parseDaeText(text: string, dir: string): Promise<{ meshes: MeshData[]; materials: MaterialData[] }> {
  const doc = parseXml(text);
  const upAxis = (findFirst(doc, "up_axis")?.text.trim() ?? "Y_UP").toUpperCase();
  const unit = Number(findFirst(doc, "unit")?.attrs.meter ?? "1") || 1;

  const images = new Map<string, string>();
  for (const img of findAll(doc, "image")) {
    const init = findFirst(img, "init_from");
    if (img.attrs.id && init) images.set(img.attrs.id, init.text.trim());
  }
  const effects = new Map<string, { diffuseTex?: string; color?: [number, number, number, number] }>();
  for (const fx of findAll(doc, "effect")) {
    const samplers = new Map<string, string>();
    const surfaces = new Map<string, string>();
    for (const np of findAll(fx, "newparam")) {
      const surf = findFirst(np, "surface");
      const init = surf ? findFirst(surf, "init_from") : undefined;
      if (np.attrs.sid && init) surfaces.set(np.attrs.sid, init.text.trim());
      const samp = findFirst(np, "sampler2D");
      const src = samp ? findFirst(samp, "source") : undefined;
      if (np.attrs.sid && src) samplers.set(np.attrs.sid, src.text.trim());
    }
    const diffuse = findFirst(fx, "diffuse");
    let diffuseTex: string | undefined;
    let color: [number, number, number, number] | undefined;
    if (diffuse) {
      const t = child(diffuse, "texture");
      if (t?.attrs.texture) {
        const s = samplers.get(t.attrs.texture);
        const surf = s ? surfaces.get(s) : undefined;
        diffuseTex = images.get(surf ?? s ?? t.attrs.texture) ?? images.get(t.attrs.texture);
      }
      const c = child(diffuse, "color");
      if (c) {
        const vals = c.text.trim().split(/\s+/).map(Number);
        color = [vals[0] ?? 0.8, vals[1] ?? 0.8, vals[2] ?? 0.8, vals[3] ?? 1];
      }
    }
    if (fx.attrs.id) effects.set(fx.attrs.id, { diffuseTex, color });
  }
  const materialById = new Map<string, { name: string; effect?: string }>();
  for (const m of findAll(doc, "material")) {
    if (!m.attrs.id) continue;
    materialById.set(m.attrs.id, { name: m.attrs.name ?? m.attrs.id, effect: findFirst(m, "instance_effect")?.attrs.url?.replace(/^#/, "") });
  }

  const geometries = new Map<string, MeshData[]>();
  for (const geo of findAll(doc, "geometry")) {
    const meshNode = child(geo, "mesh");
    if (!meshNode || !geo.attrs.id) continue;
    const sources = new Map<string, { data: Float32Array; stride: number }>();
    for (const s of children(meshNode, "source")) {
      const fa = child(s, "float_array");
      const acc = findFirst(s, "accessor");
      if (s.attrs.id && fa) {
        sources.set(s.attrs.id, { data: Float32Array.from(fa.text.trim().split(/\s+/).filter(Boolean).map(Number)), stride: Number(acc?.attrs.stride ?? "3") || 3 });
      }
    }
    const verticesNode = child(meshNode, "vertices");
    const vertexInputs = verticesNode ? children(verticesNode, "input") : [];
    const out: MeshData[] = [];
    for (const prim of meshNode.children.filter((c) => c.tag === "triangles" || c.tag === "polylist" || c.tag === "polygons")) {
      const inputs = children(prim, "input").map((inp) => ({
        semantic: inp.attrs.semantic ?? "",
        source: (inp.attrs.source ?? "").replace(/^#/, ""),
        offset: Number(inp.attrs.offset ?? "0") || 0,
        set: inp.attrs.set,
      }));
      const resolved = inputs.flatMap((inp) => {
        if (inp.semantic === "VERTEX" && verticesNode && verticesNode.attrs.id === inp.source) {
          return vertexInputs.map((vi) => ({ semantic: vi.attrs.semantic ?? "", source: (vi.attrs.source ?? "").replace(/^#/, ""), offset: inp.offset, set: vi.attrs.set }));
        }
        return [inp];
      });
      const stride = Math.max(0, ...inputs.map((i) => i.offset)) + 1;
      const pos = resolved.find((i) => i.semantic === "POSITION");
      const nrm = resolved.find((i) => i.semantic === "NORMAL");
      const uv = resolved.filter((i) => i.semantic === "TEXCOORD").sort((a, b) => Number(a.set ?? 0) - Number(b.set ?? 0))[0];
      const pSrc = pos ? sources.get(pos.source) : undefined;
      if (!pos || !pSrc) continue;
      const nSrc = nrm ? sources.get(nrm.source) : undefined;
      const uSrc = uv ? sources.get(uv.source) : undefined;
      const pText = children(prim, "p").map((p) => p.text.trim()).join(" ");
      const p = pText.split(/\s+/).filter(Boolean).map(Number);
      let faces: number[][];
      if (prim.tag === "polylist") {
        const vcount = child(prim, "vcount")?.text.trim().split(/\s+/).filter(Boolean).map(Number) ?? [];
        faces = [];
        let off = 0;
        for (const vc of vcount) {
          faces.push(p.slice(off, off + vc * stride));
          off += vc * stride;
        }
      } else if (prim.tag === "polygons") {
        faces = children(prim, "p").map((pp) => pp.text.trim().split(/\s+/).filter(Boolean).map(Number));
      } else {
        faces = [];
        for (let i = 0; i + stride * 3 <= p.length; i += stride * 3) faces.push(p.slice(i, i + stride * 3));
      }
      const map = new Map<string, number>();
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const vert = (face: number[], k: number) => {
        const key = face.slice(k * stride, k * stride + stride).join("/");
        let id = map.get(key);
        if (id === undefined) {
          const pi = face[k * stride + pos.offset]!;
          positions.push(pSrc.data[pi * pSrc.stride] ?? 0, pSrc.data[pi * pSrc.stride + 1] ?? 0, pSrc.data[pi * pSrc.stride + 2] ?? 0);
          if (nrm && nSrc) {
            const ni = face[k * stride + nrm.offset]!;
            normals.push(nSrc.data[ni * nSrc.stride] ?? 0, nSrc.data[ni * nSrc.stride + 1] ?? 0, nSrc.data[ni * nSrc.stride + 2] ?? 1);
          }
          if (uv && uSrc) {
            const ti = face[k * stride + uv.offset]!;
            uvs.push(uSrc.data[ti * uSrc.stride] ?? 0, 1 - (uSrc.data[ti * uSrc.stride + 1] ?? 0));
          }
          id = positions.length / 3 - 1;
          map.set(key, id);
        }
        return id;
      };
      for (const face of faces) {
        const count = Math.floor(face.length / stride);
        const ids: number[] = [];
        for (let k = 0; k < count; k++) ids.push(vert(face, k));
        for (let i = 1; i + 1 < ids.length; i++) indices.push(ids[0]!, ids[i]!, ids[i + 1]!);
      }
      if (!indices.length) continue;
      out.push({
        name: geo.attrs.name ?? geo.attrs.id,
        material: prim.attrs.material ?? "default",
        positions: new Float32Array(positions),
        normals: nrm && nSrc ? new Float32Array(normals) : undefined,
        uvs: uv && uSrc ? new Float32Array(uvs) : undefined,
        indices: new Uint32Array(indices),
      });
    }
    geometries.set(geo.attrs.id, out);
  }

  const meshes: MeshData[] = [];
  const symbolToMaterial = new Map<string, string>();
  const applyMatrix = (m: MeshData, mat: number[] | null): MeshData => {
    if (!mat) return m;
    const p = new Float32Array(m.positions.length);
    for (let i = 0; i < p.length; i += 3) {
      const x = m.positions[i]!, y = m.positions[i + 1]!, z = m.positions[i + 2]!;
      p[i] = mat[0]! * x + mat[1]! * y + mat[2]! * z + mat[3]!;
      p[i + 1] = mat[4]! * x + mat[5]! * y + mat[6]! * z + mat[7]!;
      p[i + 2] = mat[8]! * x + mat[9]! * y + mat[10]! * z + mat[11]!;
    }
    return { ...m, positions: p };
  };
  const seen = new Set<string>();
  const visit = (node: XmlNode, parentMat: number[] | null) => {
    let mat = parentMat;
    const mx = child(node, "matrix");
    if (mx) {
      const vals = mx.text.trim().split(/\s+/).filter(Boolean).map(Number);
      if (vals.length === 16) mat = parentMat ? mulMat(parentMat, vals) : vals;
    }
    for (const ig of children(node, "instance_geometry")) {
      const id = (ig.attrs.url ?? "").replace(/^#/, "");
      for (const im of findAll(ig, "instance_material")) {
        if (im.attrs.symbol && im.attrs.target) symbolToMaterial.set(im.attrs.symbol, im.attrs.target.replace(/^#/, ""));
      }
      for (const m of geometries.get(id) ?? []) meshes.push(applyMatrix(m, mat));
      seen.add(id);
    }
    for (const c of children(node, "node")) visit(c, mat);
  };
  for (const scene of findAll(doc, "visual_scene")) for (const n of children(scene, "node")) visit(n, null);
  if (!meshes.length) for (const [id, ms] of geometries) if (!seen.has(id)) meshes.push(...ms);

  for (const m of meshes) {
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      let x = p[i]! * unit, y = p[i + 1]! * unit, z = p[i + 2]! * unit;
      if (upAxis === "Z_UP") {
        const t = y; y = z; z = -t;
      } else if (upAxis === "X_UP") {
        const t = x; x = -y; y = t;
      }
      p[i] = x; p[i + 1] = y; p[i + 2] = z;
    }
    if (m.normals && upAxis !== "Y_UP") {
      const nn = m.normals;
      for (let i = 0; i < nn.length; i += 3) {
        if (upAxis === "Z_UP") {
          const t = nn[i + 1]!; nn[i + 1] = nn[i + 2]!; nn[i + 2] = -t;
        } else {
          const t = nn[i]!; nn[i] = -nn[i + 1]!; nn[i + 1] = t;
        }
      }
    }
  }

  const materials: MaterialData[] = [];
  const symbols = new Set(meshes.map((m) => m.material));
  for (const sym of symbols) {
    const mid = symbolToMaterial.get(sym) ?? sym;
    const mat = materialById.get(mid);
    const fx = mat?.effect ? effects.get(mat.effect) : undefined;
    let diffuse: MaterialData["diffuse"];
    if (fx?.diffuseTex) {
      const rel = decodeURIComponent(fx.diffuseTex.replace(/^file:\/\//, ""));
      for (const cand of [path.join(dir, rel), path.join(dir, path.basename(rel))]) {
        if (await exists(cand)) {
          diffuse = { file: cand, name: path.basename(cand).replace(/\.[^.]+$/, "") };
          break;
        }
      }
    }
    const name = mat?.name ?? sym;
    materials.push({ name, baseColor: fx?.color ?? [0.8, 0.8, 0.8, 1], metallic: 0, roughness: 0.7, diffuse });
    for (const m of meshes) if (m.material === sym) m.material = name;
  }
  return { meshes, materials };
}

function mulMat(a: number[], b: number[]): number[] {
  const o = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r * 4 + k]! * b[k * 4 + c]!;
      o[r * 4 + c] = s;
    }
  }
  return o;
}
