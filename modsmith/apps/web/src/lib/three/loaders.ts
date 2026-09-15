/**
 * Browser-side model loading + GLB export.
 *
 * Users drop a whole folder's worth of files (model + .mtl + textures). We build a blob-URL map keyed by
 * lowercase basename and install a LoadingManager URL modifier so companion files resolve no matter what
 * path is baked into the model. Everything is revoked again via `disposeLoaded`.
 */
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import { extOf, baseName, isModelFile } from "./texture-detect";

export interface LoadedMeshInfo {
  name: string;
  materialName: string;
  triangles: number;
  vertices: number;
}

export interface LoadedModel {
  object: THREE.Object3D;
  /** Unique material names in scene order. */
  materials: string[];
  meshes: LoadedMeshInfo[];
  triangles: number;
  vertices: number;
  sourceName: string;
  warnings: string[];
  /** Revoke every blob URL created for this load. */
  dispose(): void;
}

export interface LoadOptions {
  /** Center on the origin, rest on Y=0 and rescale obviously-wrong units (cm/inch) to metres. */
  normalize?: boolean;
  /** Rotate Z-up content to Y-up ("auto" only does it for formats that declare Z-up). */
  upAxis?: "auto" | "y" | "z";
}

const MODEL_PRIORITY = [".glb", ".gltf", ".fbx", ".obj", ".dae"];

function fileMap(files: File[]) {
  const map = new Map<string, File>();
  for (const f of files) {
    const key = (f.name.split(/[\\/]/).pop() ?? f.name).toLowerCase();
    if (!map.has(key)) map.set(key, f);
  }
  return map;
}

/** Pick the file the user most likely wants to open. */
export function pickModelFile(files: File[]): File | null {
  const models = files.filter((f) => isModelFile(f.name));
  if (!models.length) return null;
  models.sort((a, b) => MODEL_PRIORITY.indexOf(extOf(a.name)) - MODEL_PRIORITY.indexOf(extOf(b.name)));
  return models[0] ?? null;
}

function makeManager(files: File[]) {
  const map = fileMap(files);
  const urls: string[] = [];
  const cache = new Map<string, string>();
  const resolve = (name: string) => {
    const key = (decodeURIComponent(name).split(/[\\/?#]/).filter(Boolean).pop() ?? name).toLowerCase();
    const cached = cache.get(key);
    if (cached) return cached;
    const file = map.get(key);
    if (!file) return null;
    const url = URL.createObjectURL(file);
    urls.push(url);
    cache.set(key, url);
    return url;
  };
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith("data:") || url.startsWith("blob:")) return url;
    return resolve(url) ?? url;
  });
  return { manager, resolve, revoke: () => { for (const u of urls) URL.revokeObjectURL(u); urls.length = 0; cache.clear(); } };
}

function readText(file: File) { return file.text(); }
function readBuffer(file: File) { return file.arrayBuffer(); }

function collect(object: THREE.Object3D) {
  const meshes: LoadedMeshInfo[] = [];
  const materials: string[] = [];
  let triangles = 0;
  let vertices = 0;
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute("position");
    const count = pos ? pos.count : 0;
    const tris = geo.index ? geo.index.count / 3 : count / 3;
    triangles += Math.floor(tris);
    vertices += count;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const matName = mats.map((m, i) => m?.name || `${mesh.name || "mesh"}_material_${i}`).join(", ");
    for (const m of mats) {
      if (!m) continue;
      if (!m.name) m.name = `${mesh.name || "material"}_${materials.length}`;
      if (!materials.includes(m.name)) materials.push(m.name);
    }
    if (!mesh.name) mesh.name = `mesh_${meshes.length}`;
    meshes.push({ name: mesh.name, materialName: matName, triangles: Math.floor(tris), vertices: count });
  });
  return { meshes, materials, triangles, vertices };
}

/** Center on origin, sit on the ground plane, and fix obvious unit mistakes. */
export function normalizeObject(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    let scale = 1;
    if (maxDim > 250) scale = 0.01; // centimetres
    else if (maxDim > 0 && maxDim < 0.02) scale = 100; // sub-millimetre
    if (scale !== 1) object.scale.multiplyScalar(scale);
    object.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(object);
    const center = box2.getCenter(new THREE.Vector3());
    object.position.x -= center.x;
    object.position.z -= center.z;
    object.position.y -= box2.min.y;
    object.updateMatrixWorld(true);
  }
  return object;
}

/**
 * Load a model from a dropped file set. `files` should contain the model plus any companion
 * .mtl/.bin/texture files; they are matched by basename.
 */
export async function loadModelFromFiles(files: File[], opts: LoadOptions = {}): Promise<LoadedModel> {
  const main = pickModelFile(files);
  if (!main) throw new Error("No supported 3D model found. Add an OBJ, FBX, glTF, GLB or DAE file.");
  const warnings: string[] = [];
  const { manager, resolve, revoke } = makeManager(files);
  const ext = extOf(main.name);
  let object: THREE.Object3D;

  try {
    if (ext === ".obj") {
      const objLoader = new OBJLoader(manager);
      const mtlFile = files.find((f) => extOf(f.name) === ".mtl" && baseName(f.name).toLowerCase() === baseName(main.name).toLowerCase())
        ?? files.find((f) => extOf(f.name) === ".mtl");
      if (mtlFile) {
        const mtlLoader = new MTLLoader(manager);
        const creator = mtlLoader.parse(await readText(mtlFile), "");
        creator.preload();
        objLoader.setMaterials(creator);
      } else {
        warnings.push("No .mtl file found — materials default to a neutral grey.");
      }
      object = objLoader.parse(await readText(main));
    } else if (ext === ".fbx") {
      object = new FBXLoader(manager).parse(await readBuffer(main), "");
    } else if (ext === ".dae") {
      const result = new ColladaLoader(manager).parse(await readText(main), "");
      object = result.scene;
    } else {
      const loader = new GLTFLoader(manager);
      const buf = await readBuffer(main);
      const gltf = await new Promise<{ scene: THREE.Group }>((res, rej) => loader.parse(buf, "", (g) => res(g as unknown as { scene: THREE.Group }), rej));
      object = gltf.scene;
    }
  } catch (err) {
    revoke();
    throw new Error(`Could not read ${main.name}: ${(err as Error).message}`);
  }

  if (opts.upAxis === "z") {
    const wrapper = new THREE.Group();
    wrapper.rotation.x = -Math.PI / 2;
    wrapper.add(object);
    object = wrapper;
  }
  object.name = object.name || baseName(main.name);
  object.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  if (opts.normalize !== false) normalizeObject(object);

  const stats = collect(object);
  if (!stats.triangles) warnings.push("The model contains no triangles — check that the file exported geometry.");
  // Warn about textures the model asked for but we never received.
  const missing = new Set<string>();
  object.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial | undefined;
      const src = std?.map?.image as { src?: string } | undefined;
      if (src?.src && !src.src.startsWith("blob:") && !src.src.startsWith("data:")) missing.add(src.src.split("/").pop() ?? src.src);
    }
  });
  for (const m of missing) if (!resolve(m)) warnings.push(`Texture "${m}" was referenced but not uploaded.`);

  return {
    object,
    materials: stats.materials,
    meshes: stats.meshes,
    triangles: stats.triangles,
    vertices: stats.vertices,
    sourceName: main.name,
    warnings,
    dispose: () => { revoke(); disposeObject(object); },
  };
}

/** Load a GLB/GLTF from a URL (e.g. an inspect job's preview.glb artifact). */
export async function loadGlbFromUrl(url: string, opts: LoadOptions = {}): Promise<LoadedModel> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const object = gltf.scene as THREE.Object3D;
  object.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  if (opts.normalize) normalizeObject(object);
  const stats = collect(object);
  return { object, materials: stats.materials, meshes: stats.meshes, triangles: stats.triangles, vertices: stats.vertices, sourceName: url.split("/").pop() ?? "preview.glb", warnings: [], dispose: () => disposeObject(object) };
}

export function disposeObject(object: THREE.Object3D) {
  object.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      const std = m as THREE.MeshStandardMaterial;
      std.map?.dispose(); std.normalMap?.dispose(); std.roughnessMap?.dispose(); std.metalnessMap?.dispose();
      m.dispose();
    }
  });
}

/** Binary glTF with embedded images — what the worker expects for generic 3D input. */
export function exportGlb(object: THREE.Object3D): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      object,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(new Blob([result], { type: "model/gltf-binary" }));
        else reject(new Error("GLB export did not produce binary output"));
      },
      (err) => reject(err instanceof Error ? err : new Error("GLB export failed")),
      { binary: true, embedImages: true, onlyVisible: false, trs: false },
    );
  });
}

/** Rename the dropped model to `<basename>.glb` for the companion upload. */
export function glbFileName(sourceName: string) {
  return `${baseName(sourceName).replace(/[^A-Za-z0-9._-]+/g, "_") || "model"}.glb`;
}

const simplifier = new SimplifyModifier();

/**
 * Client-side approximation of a worker LOD. Uses SimplifyModifier where it is safe and falls back to
 * dropping triangles when the geometry cannot be collapsed (e.g. non-indexed multi-material meshes).
 */
export function decimateGeometry(geometry: THREE.BufferGeometry, ratio: number): THREE.BufferGeometry {
  const clamped = Math.max(0.01, Math.min(1, ratio));
  if (clamped >= 0.999) return geometry;
  const position = geometry.getAttribute("position");
  if (!position) return geometry;
  try {
    if (position.count < 60_000) {
      const merged = geometry.index ? geometry.toNonIndexed() : geometry;
      const target = Math.floor(merged.getAttribute("position").count * (1 - clamped));
      if (target > 0) return simplifier.modify(merged, target);
    }
  } catch { /* fall through to triangle skipping */ }
  return skipTriangles(geometry, clamped);
}

/** Cheap decimation: keep every Nth triangle. Always succeeds, used for very dense meshes. */
export function skipTriangles(geometry: THREE.BufferGeometry, ratio: number): THREE.BufferGeometry {
  const src = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const pos = src.getAttribute("position");
  const triCount = Math.floor(pos.count / 3);
  const keep = Math.max(1, Math.floor(triCount * ratio));
  const step = triCount / keep;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const attr = src.getAttribute(name) as THREE.BufferAttribute;
    const itemSize = attr.itemSize;
    const arr = new Float32Array(keep * 3 * itemSize);
    for (let i = 0; i < keep; i++) {
      const tri = Math.min(triCount - 1, Math.floor(i * step));
      for (let v = 0; v < 3; v++) {
        for (let c = 0; c < itemSize; c++) arr[(i * 3 + v) * itemSize + c] = attr.array[(tri * 3 + v) * itemSize + c] as number;
      }
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Build a decimated copy of a whole object for "preview LOD". */
export function decimateObject(object: THREE.Object3D, ratio: number): THREE.Object3D {
  const clone = object.clone(true);
  clone.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) mesh.geometry = decimateGeometry(mesh.geometry as THREE.BufferGeometry, ratio);
  });
  return clone;
}

export function countTriangles(object: THREE.Object3D) {
  let tris = 0;
  object.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    tris += geo.index ? geo.index.count / 3 : (geo.getAttribute("position")?.count ?? 0) / 3;
  });
  return Math.floor(tris);
}

/** All distinct materials in an object, in traversal order. */
export function materialsOf(object: THREE.Object3D): THREE.Material[] {
  const out: THREE.Material[] = [];
  object.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if (m && !out.includes(m)) out.push(m);
  });
  return out;
}

export function findMaterial(object: THREE.Object3D, name: string): THREE.Material | null {
  return materialsOf(object).find((m) => m.name === name) ?? null;
}

/** Load an image File into a THREE.Texture (used for manual texture assignment). */
export async function textureFromFile(file: File): Promise<THREE.Texture> {
  const url = URL.createObjectURL(file);
  try {
    const tex = await new THREE.TextureLoader().loadAsync(url);
    tex.name = file.name;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = true;
    return tex;
  } finally {
    // The texture keeps its own decoded image; the object URL is no longer needed.
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
