"use client";
/**
 * 2D layered design editor on an HTML canvas: images, text, shapes and freehand paint layers over a
 * UV template underlay. Emits the composite canvas so 3D previews can bind it as a CanvasTexture.
 */
import * as React from "react";
import {
  Brush, Circle, Copy, Eraser, Eye, EyeOff, Image as ImageIcon, Lock, Minus, MousePointer2, Move, Redo2, Square,
  Trash2, Type, Undo2, Unlock, ZoomIn, ZoomOut, ArrowUp, ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { canvasToPngBlob, createCanvas } from "@/lib/three/uv";
import { ColorField, NumberField, Row, SliderField } from "@/components/tools/panels";
import {
  FONT_OPTIONS, defaultShapeLayer, defaultStrokeLayer, defaultTextLayer, layerId,
  type ImageLayer, type Layer, type ShapeLayer, type StrokeLayer, type TextLayer,
} from "./layer-types";
import { drawComposite, handlePositions, hitTest, preloadImages, toLocal } from "./render";

export type { Layer } from "./layer-types";

export interface LayerEditorHandle {
  getComposite(): HTMLCanvasElement | null;
  exportPng(resolution?: number): Promise<Blob>;
  addImageFile(file: File): Promise<void>;
}

export interface LayerEditorProps {
  /** Working resolution of the composite (also the UV template size). */
  size?: number;
  /** UV template / guide drawn behind the layers but never exported. */
  underlay?: HTMLCanvasElement | string | null;
  layers: Layer[];
  onLayersChange: (layers: Layer[]) => void;
  /** Throttled: fires with the composite canvas whenever the artwork changes. */
  onChange?: (composite: HTMLCanvasElement) => void;
  apiRef?: React.MutableRefObject<LayerEditorHandle | null>;
  /** Show the brush/eraser tools (clothing, tattoos). */
  brush?: boolean;
  className?: string;
  heightClass?: string;
}

type Mode = "select" | "brush" | "eraser";
type Drag =
  | { kind: "move"; id: string; dx: number; dy: number }
  | { kind: "resize"; id: string; corner: "nw" | "ne" | "se" | "sw"; startW: number; startH: number; startX: number; startY: number; anchorX: number; anchorY: number }
  | { kind: "rotate"; id: string; start: number; startRotation: number }
  | { kind: "pan"; startX: number; startY: number; panX: number; panY: number }
  | { kind: "paint"; id: string }
  | null;

const GRID_STEP = 32;

export function LayerEditor({ size = 2048, underlay, layers, onLayersChange, onChange, apiRef, brush = false, className, heightClass = "h-[clamp(320px,58vh,720px)]" }: LayerEditorProps) {
  const composite = React.useRef<HTMLCanvasElement | null>(null);
  const displayRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<Mode>("select");
  const [brushSize, setBrushSize] = React.useState(Math.round(size / 40));
  const [brushColor, setBrushColor] = React.useState("#ffffff");
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [snap, setSnap] = React.useState(false);
  const [showUnderlay, setShowUnderlay] = React.useState(true);
  const [showGrid, setShowGrid] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const drag = React.useRef<Drag>(null);
  const undoStack = React.useRef<string[]>([]);
  const redoStack = React.useRef<string[]>([]);
  const lastEmit = React.useRef(0);
  const emitTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const underlayImg = React.useRef<HTMLImageElement | HTMLCanvasElement | null>(null);

  if (!composite.current && typeof document !== "undefined") composite.current = createCanvas(size);
  React.useEffect(() => {
    if (composite.current && composite.current.width !== size) { composite.current.width = size; composite.current.height = size; }
  }, [size]);

  React.useEffect(() => {
    if (!underlay) { underlayImg.current = null; force(); return; }
    if (typeof underlay !== "string") { underlayImg.current = underlay; force(); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { underlayImg.current = img; force(); };
    img.src = underlay;
  }, [underlay]);

  const emit = React.useCallback(() => {
    if (!onChange || !composite.current) return;
    const now = Date.now();
    if (emitTimer.current) clearTimeout(emitTimer.current);
    if (now - lastEmit.current > 140) { lastEmit.current = now; onChange(composite.current); }
    else emitTimer.current = setTimeout(() => { lastEmit.current = Date.now(); if (composite.current) onChange(composite.current); }, 160);
  }, [onChange]);

  // ── composite + display rendering ──
  const redraw = React.useCallback(() => {
    const disp = displayRef.current;
    const comp = composite.current;
    if (!disp || !comp) return;
    drawComposite(comp, layers, force);
    const wrap = wrapRef.current;
    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    const cw = wrap?.clientWidth ?? 800;
    const ch = wrap?.clientHeight ?? 600;
    if (disp.width !== Math.round(cw * dpr) || disp.height !== Math.round(ch * dpr)) {
      disp.width = Math.round(cw * dpr); disp.height = Math.round(ch * dpr);
      disp.style.width = `${cw}px`; disp.style.height = `${ch}px`;
    }
    const ctx = disp.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const fit = Math.min(cw / size, ch / size) * 0.94;
    const scale = fit * zoom;
    const ox = (cw - size * scale) / 2 + pan.x;
    const oy = (ch - size * scale) / 2 + pan.y;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    // checkerboard
    ctx.fillStyle = "#12151c";
    ctx.fillRect(0, 0, size, size);
    const cell = size / 24;
    ctx.fillStyle = "#171b24";
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * cell, y * cell, cell, cell);
    if (underlayImg.current && showUnderlay) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(underlayImg.current, 0, 0, size, size);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(comp, 0, 0, size, size);
    if (showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.09)";
      ctx.lineWidth = 1 / scale;
      for (let i = 0; i <= size; i += GRID_STEP * (size / 1024)) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
      }
    }
    ctx.strokeStyle = "rgba(249,115,22,0.6)";
    ctx.lineWidth = 2 / scale;
    ctx.strokeRect(0, 0, size, size);
    const layer = layers.find((l) => l.id === selected);
    if (layer && layer.kind !== "stroke" && mode === "select") {
      const h = handlePositions(layer);
      ctx.save();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5 / scale;
      ctx.beginPath();
      ctx.moveTo(h.nw.x, h.nw.y); ctx.lineTo(h.ne.x, h.ne.y); ctx.lineTo(h.se.x, h.se.y); ctx.lineTo(h.sw.x, h.sw.y); ctx.closePath();
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo((h.nw.x + h.ne.x) / 2, (h.nw.y + h.ne.y) / 2); ctx.lineTo(h.rotate.x, h.rotate.y); ctx.stroke();
      const r = 6 / scale;
      ctx.fillStyle = "#38bdf8";
      for (const p of [h.nw, h.ne, h.se, h.sw]) { ctx.beginPath(); ctx.rect(p.x - r, p.y - r, r * 2, r * 2); ctx.fill(); }
      ctx.beginPath(); ctx.arc(h.rotate.x, h.rotate.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    emit();
  }, [layers, selected, size, zoom, pan, showUnderlay, showGrid, mode, emit]);

  React.useEffect(() => { preloadImages(layers, force); }, [layers]);
  React.useEffect(() => { redraw(); }, [redraw]);
  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  // ── history ──
  const pushHistory = React.useCallback(() => {
    undoStack.current.push(JSON.stringify(layers));
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
  }, [layers]);
  const commit = React.useCallback((next: Layer[], before?: string) => {
    undoStack.current.push(before ?? JSON.stringify(layers));
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
    onLayersChange(next);
  }, [layers, onLayersChange]);
  const undo = React.useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(JSON.stringify(layers));
    onLayersChange(JSON.parse(prev) as Layer[]);
  }, [layers, onLayersChange]);
  const redo = React.useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(JSON.stringify(layers));
    onLayersChange(JSON.parse(next) as Layer[]);
  }, [layers, onLayersChange]);

  // ── layer ops ──
  const patch = React.useCallback((id: string, p: Partial<Layer>, record = true) => {
    const before = JSON.stringify(layers);
    const next = layers.map((l) => (l.id === id ? ({ ...l, ...p } as Layer) : l));
    if (record) commit(next, before); else onLayersChange(next);
  }, [layers, commit, onLayersChange]);

  const addLayer = React.useCallback((layer: Layer) => {
    commit([...layers, layer]);
    setSelected(layer.id);
  }, [layers, commit]);

  const removeLayer = React.useCallback((id: string) => {
    commit(layers.filter((l) => l.id !== id));
    setSelected((s) => (s === id ? null : s));
  }, [layers, commit]);

  const duplicateLayer = React.useCallback((id: string) => {
    const l = layers.find((x) => x.id === id);
    if (!l) return;
    const copy = { ...l, id: layerId(l.kind), name: `${l.name} copy`, x: l.x + size * 0.02, y: l.y + size * 0.02 } as Layer;
    commit([...layers, copy]);
    setSelected(copy.id);
  }, [layers, commit, size]);

  const moveLayer = React.useCallback((id: string, dir: -1 | 1) => {
    const i = layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layers.length) return;
    const next = [...layers];
    const [item] = next.splice(i, 1);
    next.splice(j, 0, item!);
    commit(next);
  }, [layers, commit]);

  const addImageFile = React.useCallback(async (file: File) => {
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the image"));
      reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode the image"));
      el.src = src;
    });
    const maxSide = size * 0.5;
    const ratio = Math.min(maxSide / img.width, maxSide / img.height, 1);
    const layer: ImageLayer = {
      id: layerId("image"), name: file.name.replace(/\.[^.]+$/, "").slice(0, 32) || "Image", kind: "image",
      x: size / 2, y: size / 2, w: Math.max(16, img.width * ratio), h: Math.max(16, img.height * ratio),
      rotation: 0, opacity: 1, visible: true, locked: false, src, tint: null,
    };
    addLayer(layer);
  }, [addLayer, size]);

  React.useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      getComposite: () => composite.current,
      exportPng: async (resolution?: number) => {
        if (!composite.current) throw new Error("Nothing to export yet");
        drawComposite(composite.current, layers);
        return canvasToPngBlob(composite.current, resolution);
      },
      addImageFile,
    };
    return () => { if (apiRef) apiRef.current = null; };
  }, [apiRef, layers, addImageFile]);

  // ── pointer interaction ──
  const toComposite = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const disp = displayRef.current!;
    const rect = disp.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    const fit = Math.min(cw / size, ch / size) * 0.94;
    const scale = fit * zoom;
    const ox = (cw - size * scale) / 2 + pan.x;
    const oy = (ch - size * scale) / 2 + pan.y;
    return { x: (e.clientX - rect.left - ox) / scale, y: (e.clientY - rect.top - oy) / scale, scale };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const { x, y, scale } = toComposite(e);
    if (e.button === 1 || e.shiftKey) { drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }; return; }
    if (mode === "brush" || mode === "eraser") {
      let target = layers.find((l) => l.id === selected && l.kind === "stroke") as StrokeLayer | undefined;
      const before = JSON.stringify(layers);
      let next = layers;
      if (!target) {
        target = defaultStrokeLayer();
        next = [...layers, target];
        setSelected(target.id);
      }
      const stroke = { size: brushSize, color: brushColor, erase: mode === "eraser", points: [x, y] };
      next = next.map((l) => (l.id === target!.id ? { ...(l as StrokeLayer), strokes: [...(l as StrokeLayer).strokes, stroke] } : l));
      undoStack.current.push(before);
      redoStack.current = [];
      onLayersChange(next);
      drag.current = { kind: "paint", id: target.id };
      return;
    }
    const sel = layers.find((l) => l.id === selected);
    if (sel && sel.kind !== "stroke" && !sel.locked) {
      const h = handlePositions(sel);
      const tol = 10 / scale;
      const near = (p: { x: number; y: number }) => Math.abs(p.x - x) <= tol && Math.abs(p.y - y) <= tol;
      if (near(h.rotate)) { pushHistory(); drag.current = { kind: "rotate", id: sel.id, start: Math.atan2(y - sel.y, x - sel.x), startRotation: sel.rotation }; return; }
      for (const corner of ["nw", "ne", "se", "sw"] as const) {
        if (near(h[corner])) {
          const opposite = { nw: h.se, ne: h.sw, se: h.nw, sw: h.ne }[corner];
          pushHistory();
          drag.current = { kind: "resize", id: sel.id, corner, startW: sel.w, startH: sel.h, startX: sel.x, startY: sel.y, anchorX: opposite.x, anchorY: opposite.y };
          return;
        }
      }
    }
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i]!;
      if (!l.visible || l.locked) continue;
      if (hitTest(l, x, y)) { setSelected(l.id); pushHistory(); drag.current = { kind: "move", id: l.id, dx: x - l.x, dy: y - l.y }; return; }
    }
    setSelected(null);
    drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const { x, y } = toComposite(e);
    if (d.kind === "pan") { setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) }); return; }
    if (d.kind === "paint") {
      onLayersChange(layers.map((l) => {
        if (l.id !== d.id || l.kind !== "stroke") return l;
        const strokes = [...l.strokes];
        const last = strokes[strokes.length - 1];
        if (last) strokes[strokes.length - 1] = { ...last, points: [...last.points, x, y] };
        return { ...l, strokes };
      }));
      return;
    }
    const layer = layers.find((l) => l.id === d.id);
    if (!layer) return;
    if (d.kind === "move") {
      let nx = x - d.dx;
      let ny = y - d.dy;
      if (snap) { const step = size / 32; nx = Math.round(nx / step) * step; ny = Math.round(ny / step) * step; }
      patch(layer.id, { x: nx, y: ny }, false);
    } else if (d.kind === "rotate") {
      const angle = Math.atan2(y - layer.y, x - layer.x);
      let deg = d.startRotation + ((angle - d.start) * 180) / Math.PI;
      if (snap) deg = Math.round(deg / 15) * 15;
      patch(layer.id, { rotation: Math.round(deg * 10) / 10 }, false);
    } else if (d.kind === "resize") {
      const local = toLocal({ ...layer, x: d.anchorX, y: d.anchorY } as Layer, x, y);
      const w = Math.max(8, Math.abs(local.x));
      const h = Math.max(8, Math.abs(local.y));
      const a = (layer.rotation * Math.PI) / 180;
      const cx = d.anchorX + (Math.sign(local.x) * w / 2) * Math.cos(a) - (Math.sign(local.y) * h / 2) * Math.sin(a);
      const cy = d.anchorY + (Math.sign(local.x) * w / 2) * Math.sin(a) + (Math.sign(local.y) * h / 2) * Math.cos(a);
      patch(layer.id, { w, h, x: cx, y: cy }, false);
    }
  };

  /** History is recorded once per gesture on pointer-down, so the drop just ends the drag. */
  const onPointerUp = () => { drag.current = null; };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (!selected) return;
    if (meta && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateLayer(selected); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeLayer(selected); return; }
    const step = e.shiftKey ? size / 32 : size / 256;
    const layer = layers.find((l) => l.id === selected);
    if (!layer) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); patch(layer.id, { x: layer.x - step }); }
    else if (e.key === "ArrowRight") { e.preventDefault(); patch(layer.id, { x: layer.x + step }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); patch(layer.id, { y: layer.y - step }); }
    else if (e.key === "ArrowDown") { e.preventDefault(); patch(layer.id, { y: layer.y + step }); }
  };

  const selectedLayer = layers.find((l) => l.id === selected) ?? null;
  const fileInput = React.useRef<HTMLInputElement>(null);

  return (
    <div className={cn("flex flex-col gap-3 lg:flex-row", className)} onKeyDown={onKeyDown}>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-1 rounded-md border border-border bg-bg-elevated p-1.5">
          <ToolButton active={mode === "select"} label="Select / move (V)" onClick={() => setMode("select")}><MousePointer2 /></ToolButton>
          {brush ? <ToolButton active={mode === "brush"} label="Brush (B)" onClick={() => setMode("brush")}><Brush /></ToolButton> : null}
          {brush ? <ToolButton active={mode === "eraser"} label="Eraser (E)" onClick={() => setMode("eraser")}><Eraser /></ToolButton> : null}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <ToolButton label="Add image" onClick={() => fileInput.current?.click()}><ImageIcon /></ToolButton>
          <ToolButton label="Add text" onClick={() => addLayer(defaultTextLayer(size))}><Type /></ToolButton>
          <ToolButton label="Add rectangle" onClick={() => addLayer(defaultShapeLayer(size, "rect"))}><Square /></ToolButton>
          <ToolButton label="Add ellipse" onClick={() => addLayer(defaultShapeLayer(size, "ellipse"))}><Circle /></ToolButton>
          <ToolButton label="Add line" onClick={() => addLayer(defaultShapeLayer(size, "line"))}><Minus /></ToolButton>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <ToolButton label="Undo (Ctrl+Z)" onClick={undo}><Undo2 /></ToolButton>
          <ToolButton label="Redo (Ctrl+Shift+Z)" onClick={redo}><Redo2 /></ToolButton>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <ToolButton label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}><ZoomOut /></ToolButton>
          <ToolButton label="Zoom in" onClick={() => setZoom((z) => Math.min(8, z * 1.25))}><ZoomIn /></ToolButton>
          <ToolButton label="Reset view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Move /></ToolButton>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <ToolButton active={snap} label="Snap to grid" onClick={() => setSnap((v) => !v)}>#</ToolButton>
          <ToolButton active={showGrid} label="Show grid" onClick={() => setShowGrid((v) => !v)}><Square className="opacity-60" /></ToolButton>
          {underlay ? <ToolButton active={showUnderlay} label="UV template" onClick={() => setShowUnderlay((v) => !v)}>{showUnderlay ? <Eye /> : <EyeOff />}</ToolButton> : null}
          <span className="ms-auto font-mono text-[10px] text-fg-subtle tabular-nums">{size}² · {Math.round(zoom * 100)}%</span>
        </div>
        <input
          ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void addImageFile(f); e.target.value = ""; }}
        />
        <div ref={wrapRef} className={cn("relative w-full overflow-hidden rounded-lg border border-border bg-bg-muted", heightClass)}>
          <canvas
            ref={displayRef}
            className="h-full w-full touch-none"
            role="img"
            aria-label="Design canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={(e) => { setZoom((z) => Math.max(0.25, Math.min(8, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))); }}
          />
        </div>
        {brush && mode !== "select" ? (
          <div className="mt-2 flex flex-wrap items-end gap-3 rounded-md border border-border bg-bg-elevated p-2.5">
            <div className="w-40"><SliderField label="Brush size" value={brushSize} min={2} max={Math.round(size / 6)} step={1} onChange={setBrushSize} format={(v) => `${Math.round(v)} px`} /></div>
            {mode === "brush" ? <div className="w-36"><ColorField label="Colour" value={brushColor} onChange={setBrushColor} /></div> : null}
            <p className="text-xs text-fg-subtle">Painting into {selectedLayer?.kind === "stroke" ? selectedLayer.name : "a new paint layer"}.</p>
          </div>
        ) : null}
      </div>

      <div className="w-full shrink-0 rounded-lg border border-border bg-bg-elevated lg:w-64">
        <h3 className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">Layers</h3>
        <ul className="max-h-56 overflow-y-auto scrollbar-thin" role="listbox" aria-label="Layers">
          {[...layers].reverse().map((l) => (
            <li key={l.id}>
              <div
                role="option"
                aria-selected={selected === l.id}
                tabIndex={0}
                onClick={() => setSelected(l.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(l.id); }
                  if (e.key === "ArrowUp" && e.altKey) { e.preventDefault(); moveLayer(l.id, 1); }
                  if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); moveLayer(l.id, -1); }
                }}
                className={cn("flex cursor-pointer items-center gap-1.5 border-b border-border px-2 py-1.5 text-xs", selected === l.id ? "bg-accent-soft text-fg" : "hover:bg-bg-subtle")}
              >
                <button type="button" aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} className="text-fg-subtle hover:text-fg" onClick={(e) => { e.stopPropagation(); patch(l.id, { visible: !l.visible }); }}>
                  {l.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button type="button" aria-label={l.locked ? `Unlock ${l.name}` : `Lock ${l.name}`} className="text-fg-subtle hover:text-fg" onClick={(e) => { e.stopPropagation(); patch(l.id, { locked: !l.locked }); }}>
                  {l.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </button>
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <button type="button" aria-label={`Move ${l.name} up`} className="text-fg-subtle hover:text-fg" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, 1); }}><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label={`Move ${l.name} down`} className="text-fg-subtle hover:text-fg" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, -1); }}><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          ))}
          {!layers.length ? <li className="px-3 py-4 text-center text-xs text-fg-subtle">No layers yet. Add an image, text or a shape.</li> : null}
        </ul>
        {selectedLayer ? (
          <div className="space-y-3 border-t border-border p-3">
            <div className="flex items-center gap-1">
              <Input className="h-7 flex-1 text-xs" value={selectedLayer.name} aria-label="Layer name" onChange={(e) => patch(selectedLayer.id, { name: e.target.value }, false)} />
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Duplicate layer" onClick={() => duplicateLayer(selectedLayer.id)}><Copy /></Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Delete layer" onClick={() => removeLayer(selectedLayer.id)}><Trash2 /></Button>
            </div>
            <SliderField label="Opacity" value={selectedLayer.opacity} min={0} max={1} step={0.01} onChange={(v) => patch(selectedLayer.id, { opacity: v }, false)} format={(v) => `${Math.round(v * 100)}%`} />
            {selectedLayer.kind !== "stroke" ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="X" step={1} value={selectedLayer.x} onChange={(v) => patch(selectedLayer.id, { x: v })} />
                  <NumberField label="Y" step={1} value={selectedLayer.y} onChange={(v) => patch(selectedLayer.id, { y: v })} />
                  <NumberField label="Width" step={1} value={selectedLayer.w} onChange={(v) => patch(selectedLayer.id, { w: Math.max(4, v) })} />
                  <NumberField label="Height" step={1} value={selectedLayer.h} onChange={(v) => patch(selectedLayer.id, { h: Math.max(4, v) })} />
                </div>
                <SliderField label="Rotation" value={selectedLayer.rotation} min={-180} max={180} step={1} onChange={(v) => patch(selectedLayer.id, { rotation: v }, false)} format={(v) => `${Math.round(v)}°`} />
              </>
            ) : null}
            {selectedLayer.kind === "text" ? <TextLayerFields layer={selectedLayer} onPatch={(p, rec) => patch(selectedLayer.id, p, rec)} /> : null}
            {selectedLayer.kind === "shape" ? <ShapeLayerFields layer={selectedLayer} onPatch={(p, rec) => patch(selectedLayer.id, p, rec)} /> : null}
            {selectedLayer.kind === "image" ? (
              <Row label="Tint">
                <div className="flex items-center gap-2">
                  <input type="color" aria-label="Tint colour" value={selectedLayer.tint ?? "#ffffff"} className="h-8 w-10 rounded border border-border bg-bg-elevated p-0.5" onChange={(e) => patch(selectedLayer.id, { tint: e.target.value }, false)} />
                  <Button type="button" size="sm" variant="outline" onClick={() => patch(selectedLayer.id, { tint: null })}>Clear</Button>
                </div>
              </Row>
            ) : null}
            {selectedLayer.kind === "stroke" ? (
              <Button type="button" size="sm" variant="outline" onClick={() => patch(selectedLayer.id, { strokes: [] } as Partial<StrokeLayer>)}>Clear paint</Button>
            ) : null}
          </div>
        ) : (
          <p className="p-3 text-xs text-fg-subtle">Select a layer to edit it. Arrow keys nudge, Alt+↑/↓ reorders, Ctrl+Z undoes.</p>
        )}
      </div>
    </div>
  );
}

function ToolButton({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon-sm" variant={active ? "default" : "ghost"} aria-pressed={active} aria-label={label} onClick={onClick}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TextLayerFields({ layer, onPatch }: { layer: TextLayer; onPatch: (p: Partial<TextLayer>, record?: boolean) => void }) {
  return (
    <div className="space-y-2">
      <Row label="Text">
        <Input className="h-8 text-xs" value={layer.text} onChange={(e) => onPatch({ text: e.target.value }, false)} />
      </Row>
      <Row label="Font">
        <NativeSelect className="h-8 text-xs" value={layer.font} onChange={(e) => onPatch({ font: e.target.value })}>
          {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </NativeSelect>
      </Row>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Size" step={1} value={layer.size} onChange={(v) => onPatch({ size: Math.max(4, v) }, false)} />
        <div className="space-y-1">
          <Label className="text-[11px] text-fg-subtle">Weight</Label>
          <NativeSelect className="h-8 text-xs" value={String(layer.weight)} onChange={(e) => onPatch({ weight: Number(e.target.value) })}>
            {[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
          </NativeSelect>
        </div>
      </div>
      <ColorField label="Colour" value={layer.color} onChange={(v) => onPatch({ color: v }, false)} />
      <ColorField label="Outline" value={layer.stroke} onChange={(v) => onPatch({ stroke: v }, false)} />
      <SliderField label="Outline width" value={layer.strokeWidth} min={0} max={40} step={1} onChange={(v) => onPatch({ strokeWidth: v }, false)} format={(v) => `${Math.round(v)} px`} />
      <Row label="Align">
        <NativeSelect className="h-8 text-xs" value={layer.align} onChange={(e) => onPatch({ align: e.target.value as TextLayer["align"] })}>
          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
        </NativeSelect>
      </Row>
    </div>
  );
}

function ShapeLayerFields({ layer, onPatch }: { layer: ShapeLayer; onPatch: (p: Partial<ShapeLayer>, record?: boolean) => void }) {
  return (
    <div className="space-y-2">
      {layer.shape !== "line" ? <ColorField label="Fill" value={layer.fill.slice(0, 7)} onChange={(v) => onPatch({ fill: v }, false)} /> : null}
      <ColorField label="Stroke" value={layer.stroke} onChange={(v) => onPatch({ stroke: v }, false)} />
      <SliderField label="Stroke width" value={layer.strokeWidth} min={0} max={60} step={1} onChange={(v) => onPatch({ strokeWidth: v }, false)} format={(v) => `${Math.round(v)} px`} />
      {layer.shape === "rect" ? <SliderField label="Corner radius" value={layer.radius} min={0} max={200} step={1} onChange={(v) => onPatch({ radius: v }, false)} format={(v) => `${Math.round(v)} px`} /> : null}
    </div>
  );
}

export default LayerEditor;
