/**
 * UV template rendering: draw a mesh's UV wireframe onto a canvas so 2D editors (livery, clothing,
 * weapon skins, retexture) can show the user exactly where their artwork lands.
 */
import * as THREE from "three";

export interface UvRenderOptions {
  size?: number;
  background?: string;
  line?: string;
  lineWidth?: number;
  /** Draw a faint grid behind the UV islands. */
  grid?: boolean;
  gridStep?: number;
  gridColor?: string;
}

const DEFAULTS: Required<UvRenderOptions> = {
  size: 2048,
  background: "rgba(0,0,0,0)",
  line: "rgba(255,255,255,0.55)",
  lineWidth: 1,
  grid: true,
  gridStep: 64,
  gridColor: "rgba(255,255,255,0.07)",
};

export function createCanvas(width: number, height = width) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawGrid(ctx: CanvasRenderingContext2D, size: number, step: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let x = 0; x <= size; x += step) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, size); ctx.stroke();
  }
  for (let y = 0; y <= size; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(size, y + 0.5); ctx.stroke();
  }
  ctx.restore();
}

/** Draw the UV triangles of one or more geometries into a canvas. */
export function drawUvWireframe(canvas: HTMLCanvasElement, geometries: THREE.BufferGeometry[], options: UvRenderOptions = {}) {
  const opts = { ...DEFAULTS, ...options };
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const size = canvas.width;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (opts.background !== "rgba(0,0,0,0)") { ctx.fillStyle = opts.background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if (opts.grid) drawGrid(ctx, size, opts.gridStep, opts.gridColor);
  ctx.strokeStyle = opts.line;
  ctx.lineWidth = opts.lineWidth;
  ctx.lineJoin = "round";

  for (const geometry of geometries) {
    const uv = geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
    if (!uv) continue;
    const index = geometry.index;
    const triCount = index ? index.count / 3 : uv.count / 3;
    ctx.beginPath();
    for (let t = 0; t < triCount; t++) {
      const a = index ? index.getX(t * 3) : t * 3;
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      const ax = uv.getX(a) * size, ay = (1 - uv.getY(a)) * size;
      const bx = uv.getX(b) * size, by = (1 - uv.getY(b)) * size;
      const cx = uv.getX(c) * size, cy = (1 - uv.getY(c)) * size;
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath();
    }
    ctx.stroke();
  }
  return canvas;
}

function geometriesForMaterial(object: THREE.Object3D, materialName?: string) {
  const out: THREE.BufferGeometry[] = [];
  object.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!materialName) { out.push(mesh.geometry as THREE.BufferGeometry); return; }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mats.some((m) => m?.name === materialName)) out.push(mesh.geometry as THREE.BufferGeometry);
  });
  return out;
}

/** UV template for a whole object, optionally limited to the meshes using one material. */
export function renderUvTemplate(object: THREE.Object3D, materialName?: string, options: UvRenderOptions = {}): HTMLCanvasElement {
  const size = options.size ?? DEFAULTS.size;
  const canvas = createCanvas(size);
  drawUvWireframe(canvas, geometriesForMaterial(object, materialName), options);
  return canvas;
}

/**
 * Generic fallback template when we have no real UVs (library garments, weapon placeholders):
 * a labelled grid with safe-area guides so people can still lay artwork out sensibly.
 */
export function renderPlaceholderTemplate(size: number, label: string, regions: { name: string; x: number; y: number; w: number; h: number }[] = []): HTMLCanvasElement {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  drawGrid(ctx, size, Math.max(32, Math.round(size / 32)), "rgba(255,255,255,0.08)");
  ctx.strokeStyle = "rgba(249,115,22,0.6)";
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.font = `${Math.round(size / 48)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = "rgba(249,115,22,0.85)";
  for (const r of regions) {
    ctx.strokeRect(r.x * size, r.y * size, r.w * size, r.h * size);
    ctx.fillText(r.name, r.x * size + 8, r.y * size + Math.round(size / 40));
  }
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText(label, 12, size - 12);
  return canvas;
}

/** Canvas → PNG blob at a chosen resolution (rescaled if the source canvas differs). */
export function canvasToPngBlob(canvas: HTMLCanvasElement, resolution?: number): Promise<Blob> {
  let source = canvas;
  if (resolution && resolution !== canvas.width) {
    source = createCanvas(resolution);
    const ctx = source.getContext("2d");
    if (ctx) { ctx.imageSmoothingQuality = "high"; ctx.drawImage(canvas, 0, 0, resolution, resolution); }
  }
  return new Promise((resolve, reject) => {
    source.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode PNG"))), "image/png");
  });
}

/** A CanvasTexture wired for live 2D → 3D preview. */
export function canvasTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Apply (or replace) a canvas-backed texture on every material with the given name. */
export function applyCanvasToMaterial(object: THREE.Object3D, materialName: string, canvas: HTMLCanvasElement) {
  let applied = 0;
  object.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial | undefined;
      if (!std || std.name !== materialName) continue;
      const existing = std.map;
      if (existing instanceof THREE.CanvasTexture && existing.image === canvas) { existing.needsUpdate = true; applied++; continue; }
      existing?.dispose();
      std.map = canvasTexture(canvas);
      std.needsUpdate = true;
      applied++;
    }
  });
  return applied;
}
