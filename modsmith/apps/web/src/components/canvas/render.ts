"use client";
import type { Layer, ShapeLayer, StrokeLayer, TextLayer } from "./layer-types";

const imageCache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

/** Synchronous image lookup for the render loop; kicks off a load and calls back when ready. */
export function getImage(src: string, onReady?: () => void): HTMLImageElement | null {
  const cached = imageCache.get(src);
  if (cached) return cached;
  if (!pending.has(src)) {
    const p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { imageCache.set(src, img); resolve(img); };
      img.onerror = () => reject(new Error("image failed"));
      img.src = src;
    });
    pending.set(src, p);
    p.then(() => onReady?.()).catch(() => {}).finally(() => pending.delete(src));
  } else {
    pending.get(src)!.then(() => onReady?.()).catch(() => {});
  }
  return null;
}

export function preloadImages(layers: Layer[], onReady: () => void) {
  for (const l of layers) if (l.kind === "image" && l.src) getImage(l.src, onReady);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { imageCache.set(src, img); resolve(img); };
    img.onerror = () => reject(new Error("image failed"));
    img.src = src;
  });
}

/** Render a layer set into a fresh canvas — used to export variants that are not currently open. */
export async function renderLayersOffscreen(layers: Layer[], size: number): Promise<HTMLCanvasElement> {
  await Promise.all(layers.filter((l) => l.kind === "image" && l.src).map((l) => loadImage((l as { src: string }).src).catch(() => null)));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  drawComposite(canvas, layers);
  return canvas;
}

function withTransform(ctx: CanvasRenderingContext2D, layer: Layer, draw: () => void) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
  ctx.translate(layer.x, layer.y);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
  draw();
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, layer: TextLayer) {
  ctx.font = `${layer.weight} ${layer.size}px ${layer.font}`;
  ctx.textAlign = layer.align;
  ctx.textBaseline = "middle";
  const lines = layer.text.split("\n");
  const lineHeight = layer.size * 1.15;
  const startY = -((lines.length - 1) * lineHeight) / 2;
  const offsetX = layer.align === "left" ? -layer.w / 2 : layer.align === "right" ? layer.w / 2 : 0;
  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    if (layer.strokeWidth > 0) {
      ctx.lineWidth = layer.strokeWidth;
      ctx.strokeStyle = layer.stroke;
      ctx.lineJoin = "round";
      ctx.strokeText(line, offsetX, y);
    }
    ctx.fillStyle = layer.color;
    ctx.fillText(line, offsetX, y);
  });
}

function drawShape(ctx: CanvasRenderingContext2D, layer: ShapeLayer) {
  const hw = layer.w / 2;
  const hh = layer.h / 2;
  ctx.beginPath();
  if (layer.shape === "ellipse") ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
  else if (layer.shape === "line") { ctx.moveTo(-hw, 0); ctx.lineTo(hw, 0); }
  else if (layer.radius > 0) {
    const r = Math.min(layer.radius, hw, hh);
    ctx.moveTo(-hw + r, -hh);
    ctx.arcTo(hw, -hh, hw, hh, r);
    ctx.arcTo(hw, hh, -hw, hh, r);
    ctx.arcTo(-hw, hh, -hw, -hh, r);
    ctx.arcTo(-hw, -hh, hw, -hh, r);
    ctx.closePath();
  } else ctx.rect(-hw, -hh, layer.w, layer.h);
  if (layer.shape !== "line" && layer.fill && !layer.fill.endsWith("00")) { ctx.fillStyle = layer.fill; ctx.fill(); }
  if (layer.strokeWidth > 0) { ctx.lineWidth = layer.strokeWidth; ctx.strokeStyle = layer.stroke; ctx.lineCap = "round"; ctx.stroke(); }
}

function drawStrokes(ctx: CanvasRenderingContext2D, layer: StrokeLayer) {
  for (const s of layer.strokes) {
    if (s.points.length < 2) continue;
    ctx.save();
    ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(s.points[0]!, s.points[1]!);
    if (s.points.length === 2) ctx.lineTo(s.points[0]! + 0.01, s.points[1]!);
    for (let i = 2; i < s.points.length; i += 2) ctx.lineTo(s.points[i]!, s.points[i + 1]!);
    ctx.stroke();
    ctx.restore();
  }
}

/** Draw every visible layer into the composite canvas (transparent background). */
export function drawComposite(canvas: HTMLCanvasElement, layers: Layer[], onImageReady?: () => void) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (layer.kind === "stroke") {
      // Strokes paint in composite space, including their own eraser compositing.
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      drawStrokes(ctx, layer);
      ctx.restore();
      continue;
    }
    withTransform(ctx, layer, () => {
      if (layer.kind === "image") {
        const img = getImage(layer.src, onImageReady);
        if (!img) return;
        ctx.drawImage(img, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
        if (layer.tint) {
          ctx.globalCompositeOperation = "source-atop";
          ctx.fillStyle = layer.tint;
          ctx.fillRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h);
          ctx.globalCompositeOperation = "source-over";
        }
      } else if (layer.kind === "text") drawText(ctx, layer);
      else drawShape(ctx, layer);
    });
  }
}

/** Point → layer-local coordinates (accounting for rotation around the layer centre). */
export function toLocal(layer: Layer, x: number, y: number) {
  const dx = x - layer.x;
  const dy = y - layer.y;
  const a = (-layer.rotation * Math.PI) / 180;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

export function hitTest(layer: Layer, x: number, y: number) {
  if (layer.kind === "stroke") return false;
  const p = toLocal(layer, x, y);
  return Math.abs(p.x) <= layer.w / 2 + 2 && Math.abs(p.y) <= layer.h / 2 + 2;
}

/** Handle positions in composite space: 4 corners + a rotate handle above the top edge. */
export function handlePositions(layer: Layer) {
  const hw = layer.w / 2;
  const hh = layer.h / 2;
  const a = (layer.rotation * Math.PI) / 180;
  const rot = (px: number, py: number) => ({ x: layer.x + px * Math.cos(a) - py * Math.sin(a), y: layer.y + px * Math.sin(a) + py * Math.cos(a) });
  return {
    nw: rot(-hw, -hh), ne: rot(hw, -hh), se: rot(hw, hh), sw: rot(-hw, hh),
    rotate: rot(0, -hh - Math.max(24, layer.h * 0.18)),
  };
}
