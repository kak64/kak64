/**
 * Lightweight in-memory mesh interchange used between the loaders (GLB/OBJ/DAE),
 * the simplifier, the RAGE encoders and the software rasterizers.
 */
export interface MeshData {
  name: string;
  material: string;
  positions: Float32Array; // xyz
  normals?: Float32Array; // xyz
  uvs?: Float32Array; // uv
  colors?: Float32Array; // rgba
  indices: Uint32Array;
}

export interface TextureSlotRef {
  /** Local file path or in-memory buffer of the image (PNG/JPG/DDS/…). */
  file?: string;
  buffer?: Buffer;
  /** Name used for the RAGE texture (without extension). */
  name: string;
}

export interface MaterialData {
  name: string;
  baseColor: [number, number, number, number];
  metallic: number;
  roughness: number;
  diffuse?: TextureSlotRef;
  normal?: TextureSlotRef;
  specular?: TextureSlotRef;
  roughnessMap?: TextureSlotRef;
  metalnessMap?: TextureSlotRef;
  doubleSided?: boolean;
  alpha?: boolean;
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  size: [number, number, number];
  radius: number;
}

export function triangleCount(meshes: MeshData[]): number {
  return meshes.reduce((n, m) => n + Math.floor(m.indices.length / 3), 0);
}

export function vertexCount(meshes: MeshData[]): number {
  return meshes.reduce((n, m) => n + Math.floor(m.positions.length / 3), 0);
}

export function computeBounds(meshes: MeshData[]): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = p[i + a]!;
        if (v < min[a]!) min[a] = v;
        if (v > max[a]!) max[a] = v;
      }
    }
  }
  if (!Number.isFinite(min[0])) {
    min[0] = min[1] = min[2] = 0;
    max[0] = max[1] = max[2] = 0;
  }
  const center: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const size: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const radius = Math.sqrt(size[0] ** 2 + size[1] ** 2 + size[2] ** 2) / 2;
  return { min, max, center, size, radius };
}

export type Mat4 = Float64Array; // column-major, 16 entries

export function mat4Identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** Compose T * Rz * Ry * Rx * S (rotation in degrees, XYZ Euler). */
export function mat4Compose(position: [number, number, number], rotationDeg: [number, number, number], scale: [number, number, number]): Mat4 {
  const rx = (rotationDeg[0] * Math.PI) / 180;
  const ry = (rotationDeg[1] * Math.PI) / 180;
  const rz = (rotationDeg[2] * Math.PI) / 180;
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const r00 = cz * cy, r01 = cz * sy * sx - sz * cx, r02 = cz * sy * cx + sz * sx;
  const r10 = sz * cy, r11 = sz * sy * sx + cz * cx, r12 = sz * sy * cx - cz * sx;
  const r20 = -sy, r21 = cy * sx, r22 = cy * cx;
  const m = new Float64Array(16);
  m[0] = r00 * scale[0]; m[1] = r10 * scale[0]; m[2] = r20 * scale[0]; m[3] = 0;
  m[4] = r01 * scale[1]; m[5] = r11 * scale[1]; m[6] = r21 * scale[1]; m[7] = 0;
  m[8] = r02 * scale[2]; m[9] = r12 * scale[2]; m[10] = r22 * scale[2]; m[11] = 0;
  m[12] = position[0]; m[13] = position[1]; m[14] = position[2]; m[15] = 1;
  return m;
}

function normalMatrix(m: Mat4): number[] {
  const a = m[0]!, b = m[4]!, c = m[8]!, d = m[1]!, e = m[5]!, f = m[9]!, g = m[2]!, h = m[6]!, i = m[10]!;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C || 1;
  const inv = [A / det, (c * h - b * i) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, (c * d - a * f) / det, C / det, (b * g - a * h) / det, (a * e - b * d) / det];
  return [inv[0]!, inv[3]!, inv[6]!, inv[1]!, inv[4]!, inv[7]!, inv[2]!, inv[5]!, inv[8]!];
}

export function transformMesh(mesh: MeshData, m: Mat4): MeshData {
  const p = mesh.positions;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
    out[i] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
    out[i + 1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
    out[i + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
  }
  let normals: Float32Array | undefined;
  if (mesh.normals) {
    const nm = normalMatrix(m);
    normals = new Float32Array(mesh.normals.length);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const x = mesh.normals[i]!, y = mesh.normals[i + 1]!, z = mesh.normals[i + 2]!;
      let nx = nm[0]! * x + nm[1]! * y + nm[2]! * z;
      let ny = nm[3]! * x + nm[4]! * y + nm[5]! * z;
      let nz = nm[6]! * x + nm[7]! * y + nm[8]! * z;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      normals[i] = nx; normals[i + 1] = ny; normals[i + 2] = nz;
    }
  }
  const det = m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
  let indices = mesh.indices;
  if (det < 0) {
    indices = new Uint32Array(mesh.indices.length);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      indices[i] = mesh.indices[i]!;
      indices[i + 1] = mesh.indices[i + 2]!;
      indices[i + 2] = mesh.indices[i + 1]!;
    }
  }
  return { ...mesh, positions: out, normals, indices };
}

/** Smooth-ish vertex normals accumulated from face normals. */
export function computeNormals(mesh: MeshData): Float32Array {
  const n = new Float32Array(mesh.positions.length);
  const p = mesh.positions;
  const idx = mesh.indices;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i]! * 3, b = idx[i + 1]! * 3, c = idx[i + 2]! * 3;
    const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) {
      n[o] = n[o]! + nx;
      n[o + 1] = n[o + 1]! + ny;
      n[o + 2] = n[o + 2]! + nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) || 1;
    n[i] = n[i]! / l; n[i + 1] = n[i + 1]! / l; n[i + 2] = n[i + 2]! / l;
  }
  return n;
}

/** Drop vertices not referenced by any index and remap the index buffer. */
export function compactMesh(mesh: MeshData): MeshData {
  const used = new Int32Array(mesh.positions.length / 3).fill(-1);
  let next = 0;
  for (const i of mesh.indices) if (used[i] === -1) used[i] = next++;
  const pick = (src: Float32Array | undefined, comps: number) => {
    if (!src) return undefined;
    const out = new Float32Array(next * comps);
    for (let v = 0; v < used.length; v++) {
      const dst = used[v]!;
      if (dst < 0) continue;
      for (let c = 0; c < comps; c++) out[dst * comps + c] = src[v * comps + c] ?? 0;
    }
    return out;
  };
  const indices = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < mesh.indices.length; i++) indices[i] = used[mesh.indices[i]!]!;
  return { ...mesh, positions: pick(mesh.positions, 3)!, normals: pick(mesh.normals, 3), uvs: pick(mesh.uvs, 2), colors: pick(mesh.colors, 4), indices };
}

/** Merge meshes into one buffer (used for collision hulls and thumbnails). */
export function mergeMeshes(meshes: MeshData[], name = "merged"): MeshData {
  let vcount = 0;
  let icount = 0;
  for (const m of meshes) {
    vcount += m.positions.length / 3;
    icount += m.indices.length;
  }
  const positions = new Float32Array(vcount * 3);
  const normals = new Float32Array(vcount * 3);
  const indices = new Uint32Array(icount);
  let vo = 0, io = 0;
  let anyNormals = false;
  for (const m of meshes) {
    positions.set(m.positions, vo * 3);
    if (m.normals && m.normals.length === m.positions.length) {
      normals.set(m.normals, vo * 3);
      anyNormals = true;
    }
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i]! + vo;
    vo += m.positions.length / 3;
    io += m.indices.length;
  }
  return { name, material: meshes[0]?.material ?? "default", positions, normals: anyNormals ? normals : undefined, indices };
}

/** Axis-aligned unit box mesh for a given bounds (collision fallback / placeholders). */
export function boxMesh(b: Bounds, name = "box"): MeshData {
  const [x0, y0, z0] = b.min;
  const [x1, y1, z1] = b.max;
  const positions = new Float32Array([
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  ]);
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ]);
  const mesh: MeshData = { name, material: "default", positions, indices };
  return { ...mesh, normals: computeNormals(mesh) };
}
