import sharp from "sharp";
import { computeBounds, mergeMeshes, computeNormals, type MeshData } from "./mesh";

export interface ThumbnailOptions {
  size?: number;
  background?: [number, number, number, number];
  color?: [number, number, number];
  /** Camera yaw/pitch in degrees (default: three-quarter view). */
  yaw?: number;
  pitch?: number;
}

/**
 * Render a lit orthographic preview of a mesh with a plain software rasterizer
 * (z-buffer + Lambert shading). No GPU, no headless browser — good enough for the
 * thumbnails shown on creation cards.
 */
export async function renderMeshThumbnail(meshes: MeshData[], opts: ThumbnailOptions = {}): Promise<Buffer | null> {
  const size = opts.size ?? 512;
  const list = meshes.filter((m) => m.indices.length >= 3);
  if (!list.length) return null;
  const merged = mergeMeshes(list, "thumb");
  const normals = merged.normals && merged.normals.length === merged.positions.length ? merged.normals : computeNormals(merged);
  const bounds = computeBounds([merged]);
  const radius = Math.max(bounds.radius, 1e-4);

  const yaw = ((opts.yaw ?? 35) * Math.PI) / 180;
  const pitch = ((opts.pitch ?? 25) * Math.PI) / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // View basis: right, up, forward
  const right: [number, number, number] = [cy, 0, -sy];
  const up: [number, number, number] = [sy * sp, cp, cy * sp];
  const fwd: [number, number, number] = [sy * cp, -sp, cy * cp];
  const dot = (a: [number, number, number], x: number, y: number, z: number) => a[0] * x + a[1] * y + a[2] * z;

  const bg = opts.background ?? [16, 18, 22, 255];
  const base = opts.color ?? [216, 220, 228];
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = bg[0];
    pixels[i * 4 + 1] = bg[1];
    pixels[i * 4 + 2] = bg[2];
    pixels[i * 4 + 3] = bg[3];
  }
  const depth = new Float32Array(size * size).fill(Infinity);
  const margin = 0.92;
  const scale = (size / 2) * margin / radius;
  const cx = bounds.center[0], ccy = bounds.center[1], ccz = bounds.center[2];

  const project = (x: number, y: number, z: number) => {
    const dx = x - cx, dy = y - ccy, dz = z - ccz;
    return {
      x: size / 2 + dot(right, dx, dy, dz) * scale,
      y: size / 2 - dot(up, dx, dy, dz) * scale,
      z: dot(fwd, dx, dy, dz),
    };
  };

  const light: [number, number, number] = [0.4, 0.75, 0.53];
  const p = merged.positions;
  const idx = merged.indices;
  let drew = 0;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const ia = idx[t]! * 3, ib = idx[t + 1]! * 3, ic = idx[t + 2]! * 3;
    const a = project(p[ia]!, p[ia + 1]!, p[ia + 2]!);
    const b = project(p[ib]!, p[ib + 1]!, p[ib + 2]!);
    const c = project(p[ic]!, p[ic + 1]!, p[ic + 2]!);
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    if (minX > maxX || minY > maxY) continue;
    const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (Math.abs(area) < 1e-8) continue;
    // Average vertex normal for flat-ish shading
    const nx = (normals[ia]! + normals[ib]! + normals[ic]!) / 3;
    const ny = (normals[ia + 1]! + normals[ib + 1]! + normals[ic + 1]!) / 3;
    const nz = (normals[ia + 2]! + normals[ib + 2]! + normals[ic + 2]!) / 3;
    const nl = Math.hypot(nx, ny, nz) || 1;
    let lambert = (nx / nl) * light[0] + (ny / nl) * light[1] + (nz / nl) * light[2];
    if (dot(fwd, nx / nl, ny / nl, nz / nl) > 0) lambert = -lambert; // back-facing normal: light the visible side
    const shade = 0.25 + 0.75 * Math.max(0, lambert);
    const r = Math.min(255, Math.round(base[0] * shade));
    const g = Math.min(255, Math.round(base[1] * shade));
    const bl = Math.min(255, Math.round(base[2] * shade));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y)) / area;
        const w1 = ((px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const z = a.z * w2 + b.z * w1 + c.z * w0;
        const o = y * size + x;
        if (z >= depth[o]!) continue;
        depth[o] = z;
        pixels[o * 4] = r;
        pixels[o * 4 + 1] = g;
        pixels[o * 4 + 2] = bl;
        pixels[o * 4 + 3] = 255;
        drew++;
      }
    }
  }
  if (!drew) return null;
  return sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

/** Fallback thumbnail: the first diffuse texture, centre-cropped to a square PNG. */
export async function textureThumbnail(input: string | Buffer, size = 512): Promise<Buffer> {
  const img = typeof input === "string" ? sharp(input) : sharp(input);
  return img.resize(size, size, { fit: "cover" }).png().toBuffer();
}

/** Rasterize UV triangle edges onto a transparent PNG (the editors' UV template). */
export async function renderUvTemplate(meshes: MeshData[], opts: { size?: number; color?: [number, number, number]; alpha?: number } = {}): Promise<Buffer> {
  const size = opts.size ?? 2048;
  const [r, g, b] = opts.color ?? [255, 255, 255];
  const alpha = opts.alpha ?? 235;
  const pixels = Buffer.alloc(size * size * 4); // transparent
  const plot = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const o = (y * size + x) * 4;
    pixels[o] = r;
    pixels[o + 1] = g;
    pixels[o + 2] = b;
    pixels[o + 3] = alpha;
  };
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let err = dx + dy;
    let guard = 0;
    for (;;) {
      plot(x, y);
      if ((x === ex && y === ey) || guard++ > size * 4) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  };
  for (const m of meshes) {
    if (!m.uvs) continue;
    const uv = m.uvs;
    const idx = m.indices;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const ids = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
      const pts = ids.map((i) => [((uv[i * 2] ?? 0) % 1 + 1) % 1 * (size - 1), ((uv[i * 2 + 1] ?? 0) % 1 + 1) % 1 * (size - 1)] as [number, number]);
      for (let e = 0; e < 3; e++) {
        const a = pts[e]!;
        const c = pts[(e + 1) % 3]!;
        // Skip edges that wrap across the atlas (tiled UVs) to avoid noise lines.
        if (Math.abs(a[0] - c[0]) > size * 0.75 || Math.abs(a[1] - c[1]) > size * 0.75) continue;
        line(a[0], a[1], c[0], c[1]);
      }
    }
  }
  return sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}
