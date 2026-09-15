/** Layer model for the 2D design editor (liveries, clothing, weapon skins, tattoos). */

export type LayerKind = "image" | "text" | "shape" | "stroke";

export interface LayerBase {
  id: string;
  name: string;
  kind: LayerKind;
  /** Centre position and size in composite pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees. */
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface ImageLayer extends LayerBase {
  kind: "image";
  /** data: URL so the layer survives a reload. */
  src: string;
  tint?: string | null;
}

export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  font: string;
  size: number;
  weight: number;
  color: string;
  stroke: string;
  strokeWidth: number;
  align: "left" | "center" | "right";
}

export interface ShapeLayer extends LayerBase {
  kind: "shape";
  shape: "rect" | "ellipse" | "line";
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

export interface BrushStroke {
  size: number;
  color: string;
  erase: boolean;
  points: number[]; // flat [x0,y0,x1,y1,…] in composite pixels
}

export interface StrokeLayer extends LayerBase {
  kind: "stroke";
  strokes: BrushStroke[];
}

export type Layer = ImageLayer | TextLayer | ShapeLayer | StrokeLayer;

export const FONT_OPTIONS = [
  { value: "ui-sans-serif, system-ui, sans-serif", label: "System sans" },
  { value: "Georgia, 'Times New Roman', serif", label: "Serif" },
  { value: "'Arial Black', Arial, sans-serif", label: "Arial Black" },
  { value: "Impact, Haettenschweiler, sans-serif", label: "Impact" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "'Courier New', ui-monospace, monospace", label: "Monospace" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet" },
];

export const EXPORT_RESOLUTIONS = [1024, 2048, 4096] as const;
export type ExportResolution = (typeof EXPORT_RESOLUTIONS)[number];

let counter = 0;
export function layerId(prefix = "layer") {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function defaultTextLayer(size: number): TextLayer {
  return {
    id: layerId("text"), name: "Text", kind: "text", x: size / 2, y: size / 2, w: size * 0.4, h: size * 0.12,
    rotation: 0, opacity: 1, visible: true, locked: false,
    text: "TEXT", font: FONT_OPTIONS[0]!.value, size: Math.round(size * 0.08), weight: 700, color: "#ffffff", stroke: "#000000", strokeWidth: 0, align: "center",
  };
}

export function defaultShapeLayer(size: number, shape: ShapeLayer["shape"] = "rect"): ShapeLayer {
  return {
    id: layerId("shape"), name: shape === "rect" ? "Rectangle" : shape === "ellipse" ? "Ellipse" : "Line", kind: "shape",
    x: size / 2, y: size / 2, w: size * 0.25, h: shape === "line" ? size * 0.01 : size * 0.18,
    rotation: 0, opacity: 1, visible: true, locked: false,
    shape, fill: shape === "line" ? "#00000000" : "#f97316", stroke: "#ffffff", strokeWidth: shape === "line" ? 8 : 0, radius: 0,
  };
}

export function defaultStrokeLayer(): StrokeLayer {
  return { id: layerId("paint"), name: "Paint", kind: "stroke", x: 0, y: 0, w: 0, h: 0, rotation: 0, opacity: 1, visible: true, locked: false, strokes: [] };
}
