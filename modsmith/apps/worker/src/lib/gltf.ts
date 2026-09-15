import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Document, NodeIO, type Material, type Node, type Primitive, type Texture } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptSimplifier } from "meshoptimizer";
import { ProcessingError } from "./errors";
import { extOf } from "./files";
import { loadDae } from "./dae";
import { loadObj } from "./obj";
import { compactMesh, computeBounds, computeNormals, transformMesh, triangleCount, type Bounds, type MaterialData, type MeshData, type Mat4 } from "./mesh";

export interface LoadedModel {
  meshes: MeshData[];
  materials: MaterialData[];
  bounds: Bounds;
  format: "glb" | "gltf" | "obj" | "dae";
  /** Files written for embedded glTF images, so texture conversion can read them. */
  tempDir?: string;
}

let io: NodeIO | null = null;
function nodeIo(): NodeIO {
  if (!io) io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  return io;
}

function mat4FromNode(node: Node): Mat4 {
  const m = node.getWorldMatrix() as number[];
  return Float64Array.from(m) as Mat4;
}

async function textureToFile(tex: Texture | null, dir: string, fallbackName: string): Promise<{ file: string; name: string } | undefined> {
  if (!tex) return undefined;
  const img = tex.getImage();
  if (!img) return undefined;
  const mime = tex.getMimeType() || "image/png";
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const base = (tex.getName() || fallbackName).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40) || fallbackName;
  const file = path.join(dir, `${base}.${ext}`);
  await writeFile(file, Buffer.from(img));
  return { file, name: base };
}

function primitiveToMesh(prim: Primitive, name: string, materialName: string): MeshData | null {
  if (prim.getMode() !== 4 /* TRIANGLES */) return null;
  const pos = prim.getAttribute("POSITION");
  if (!pos) return null;
  const positions = Float32Array.from(pos.getArray() as ArrayLike<number>);
  const nrmAttr = prim.getAttribute("NORMAL");
  const uvAttr = prim.getAttribute("TEXCOORD_0");
  const colAttr = prim.getAttribute("COLOR_0");
  const idxAccessor = prim.getIndices();
  let indices: Uint32Array;
  if (idxAccessor) {
    indices = Uint32Array.from(idxAccessor.getArray() as ArrayLike<number>);
  } else {
    indices = new Uint32Array(positions.length / 3);
    for (let i = 0; i < indices.length; i++) indices[i] = i;
  }
  const normals = nrmAttr ? Float32Array.from(nrmAttr.getArray() as ArrayLike<number>) : undefined;
  const uvs = uvAttr ? Float32Array.from(uvAttr.getArray() as ArrayLike<number>) : undefined;
  let colors: Float32Array | undefined;
  if (colAttr) {
    const raw = colAttr.getArray() as ArrayLike<number>;
    const comps = colAttr.getElementSize();
    const count = colAttr.getCount();
    colors = new Float32Array(count * 4);
    const norm = colAttr.getNormalized();
    const max = norm ? (raw instanceof Uint8Array ? 255 : 65535) : 1;
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < 4; c++) colors[i * 4 + c] = c < comps ? (raw[i * comps + c] ?? 0) / max : 1;
    }
  }
  return { name, material: materialName, positions, normals, uvs, colors, indices };
}

async function materialFromGltf(mat: Material | null, dir: string, index: number): Promise<MaterialData> {
  const name = mat?.getName() || `material_${index}`;
  const base = (mat?.getBaseColorFactor() as number[] | undefined) ?? [1, 1, 1, 1];
  return {
    name,
    baseColor: [base[0] ?? 1, base[1] ?? 1, base[2] ?? 1, base[3] ?? 1],
    metallic: mat?.getMetallicFactor() ?? 0,
    roughness: mat?.getRoughnessFactor() ?? 0.7,
    diffuse: await textureToFile(mat?.getBaseColorTexture() ?? null, dir, `${name}_d`),
    normal: await textureToFile(mat?.getNormalTexture() ?? null, dir, `${name}_n`),
    roughnessMap: await textureToFile(mat?.getMetallicRoughnessTexture() ?? null, dir, `${name}_mr`),
    doubleSided: mat?.getDoubleSided() ?? false,
    alpha: (mat?.getAlphaMode() ?? "OPAQUE") !== "OPAQUE" || (base[3] ?? 1) < 1,
  };
}

/** Turn a gltf-transform Document into flat mesh + material data (world space). */
export async function documentToMeshes(doc: Document, dir: string): Promise<{ meshes: MeshData[]; materials: MaterialData[] }> {
  const meshes: MeshData[] = [];
  const materials = new Map<string, MaterialData>();
  const root = doc.getRoot();
  const matList = root.listMaterials();
  for (let i = 0; i < matList.length; i++) {
    const md = await materialFromGltf(matList[i]!, dir, i);
    materials.set(md.name, md);
  }
  const scenes = root.listScenes();
  const nodes = scenes.length ? scenes.flatMap((s) => s.listChildren()) : root.listNodes();
  const visit = (node: Node) => {
    const mesh = node.getMesh();
    if (mesh) {
      const m4 = mat4FromNode(node);
      const prims = mesh.listPrimitives();
      for (let p = 0; p < prims.length; p++) {
        const prim = prims[p]!;
        const mat = prim.getMaterial();
        const matName = mat?.getName() || "default";
        if (!materials.has(matName)) materials.set(matName, { name: matName, baseColor: [0.8, 0.8, 0.8, 1], metallic: 0, roughness: 0.7 });
        const md = primitiveToMesh(prim, mesh.getName() || node.getName() || `mesh_${p}`, matName);
        if (md) meshes.push(transformMesh(md, m4));
      }
    }
    for (const c of node.listChildren()) visit(c);
  };
  for (const n of nodes) visit(n);
  // Drop materials that no mesh references (keeps texture conversion focused).
  const used = new Set(meshes.map((m) => m.material));
  for (const key of [...materials.keys()]) if (!used.has(key)) materials.delete(key);
  return { meshes, materials: [...materials.values()] };
}

export async function readGlb(file: string): Promise<Document> {
  try {
    return await nodeIo().read(file);
  } catch (e) {
    throw new ProcessingError("INVALID_MODEL", `Could not read the glTF/GLB model: ${(e as Error).message}`);
  }
}

/** Load any supported model file into mesh/material data. */
export async function loadModel(file: string, opts: { extraDirs?: string[] } = {}): Promise<LoadedModel> {
  const ext = extOf(file);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "modsmith-gltf-"));
  if (ext === "glb" || ext === "gltf") {
    const doc = await readGlb(file);
    const { meshes, materials } = await documentToMeshes(doc, tempDir);
    if (!meshes.length) throw new ProcessingError("EMPTY_MODEL", "The model contains no triangle geometry");
    return { meshes, materials, bounds: computeBounds(meshes), format: ext, tempDir };
  }
  if (ext === "obj") {
    const { meshes, materials } = await loadObj(file, opts.extraDirs ?? []);
    if (!meshes.length) throw new ProcessingError("EMPTY_MODEL", "The OBJ file contains no faces");
    return { meshes, materials, bounds: computeBounds(meshes), format: "obj", tempDir };
  }
  if (ext === "dae") {
    const { meshes, materials } = await loadDae(file);
    if (!meshes.length) throw new ProcessingError("EMPTY_MODEL", "The COLLADA file contains no triangles or polylists we can read");
    return { meshes, materials, bounds: computeBounds(meshes), format: "dae", tempDir };
  }
  throw new ProcessingError("UNSUPPORTED_FORMAT", `Cannot load "${path.basename(file)}" — upload GLB, glTF, OBJ or DAE`);
}

let simplifierReady: Promise<void> | null = null;
async function readySimplifier() {
  if (!simplifierReady) simplifierReady = MeshoptSimplifier.ready;
  await simplifierReady;
}

/**
 * Decimate a single mesh towards `ratio` of its triangles using meshoptimizer.
 * Returns the original when the mesh is already small or the simplifier cannot help.
 */
export async function simplifyMesh(mesh: MeshData, ratio: number, error = 0.02): Promise<MeshData> {
  if (ratio >= 0.999) return mesh;
  await readySimplifier();
  const targetIndexCount = Math.max(3, Math.floor((mesh.indices.length * ratio) / 3) * 3);
  if (targetIndexCount >= mesh.indices.length) return mesh;
  const [indices] = MeshoptSimplifier.simplify(
    Uint32Array.from(mesh.indices),
    Float32Array.from(mesh.positions),
    3,
    targetIndexCount,
    error,
  );
  if (!indices.length) return mesh;
  return compactMesh({ ...mesh, indices: Uint32Array.from(indices) });
}

/** Decimate every mesh of a model toward an overall triangle ratio. */
export async function simplifyMeshes(meshes: MeshData[], ratio: number, error = 0.02): Promise<MeshData[]> {
  if (ratio >= 0.999) return meshes;
  const out: MeshData[] = [];
  for (const m of meshes) {
    const s = await simplifyMesh(m, ratio, error);
    if (s.indices.length >= 3) out.push(s);
  }
  return out.length ? out : meshes;
}

/** Ratio needed to hit an absolute triangle budget. */
export function ratioForTarget(meshes: MeshData[], targetTriangles?: number): number {
  if (!targetTriangles) return 1;
  const tris = triangleCount(meshes);
  if (!tris || tris <= targetTriangles) return 1;
  return Math.max(0.01, targetTriangles / tris);
}

export interface LodSet {
  high: MeshData[];
  med?: MeshData[];
  low?: MeshData[];
  vlow?: MeshData[];
}

export async function buildLods(base: MeshData[], ratios: { high: number; medium: number; low: number; veryLow: number }, auto: boolean): Promise<LodSet> {
  const high = await simplifyMeshes(base, ratios.high);
  if (!auto) return { high };
  return {
    high,
    med: await simplifyMeshes(high, Math.min(1, ratios.medium / Math.max(ratios.high, 0.001))),
    low: await simplifyMeshes(high, Math.min(1, ratios.low / Math.max(ratios.high, 0.001))),
    vlow: await simplifyMeshes(high, Math.min(1, ratios.veryLow / Math.max(ratios.high, 0.001))),
  };
}

/** Build a GLB (as a Buffer) from mesh/material data — used for previews and AI output. */
export async function buildGlb(meshes: MeshData[], materials: MaterialData[], opts: { name?: string; images?: Map<string, { data: Buffer; mime: string }> } = {}): Promise<Buffer> {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene(opts.name ?? "scene");
  const matMap = new Map<string, Material>();
  for (const md of materials) {
    const mat = doc.createMaterial(md.name)
      .setBaseColorFactor(md.baseColor)
      .setMetallicFactor(md.metallic)
      .setRoughnessFactor(md.roughness)
      .setDoubleSided(!!md.doubleSided)
      .setAlphaMode(md.alpha ? "BLEND" : "OPAQUE");
    const img = opts.images?.get(md.name) ?? (md.diffuse?.buffer ? { data: md.diffuse.buffer, mime: "image/png" } : undefined);
    if (img) {
      const tex = doc.createTexture(md.diffuse?.name ?? md.name).setImage(new Uint8Array(img.data)).setMimeType(img.mime);
      mat.setBaseColorTexture(tex);
    }
    matMap.set(md.name, mat);
  }
  for (const m of meshes) {
    if (!m.indices.length) continue;
    const mesh = doc.createMesh(m.name || "mesh");
    const prim = doc.createPrimitive().setMode(4);
    prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(Float32Array.from(m.positions)));
    const normals = m.normals && m.normals.length === m.positions.length ? m.normals : computeNormals(m);
    prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(Float32Array.from(normals)));
    if (m.uvs && m.uvs.length === (m.positions.length / 3) * 2) {
      prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(Float32Array.from(m.uvs)));
    }
    if (m.colors && m.colors.length === (m.positions.length / 3) * 4) {
      prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(Float32Array.from(m.colors)));
    }
    prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(Uint32Array.from(m.indices)));
    const mat = matMap.get(m.material);
    if (mat) prim.setMaterial(mat);
    mesh.addPrimitive(prim);
    scene.addChild(doc.createNode(m.name || "node").setMesh(mesh));
  }
  const glb = await nodeIo().writeBinary(doc);
  return Buffer.from(glb);
}

export { computeBounds, triangleCount };
