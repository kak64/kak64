import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ProcessingError } from "./errors";
import { loadRage, requireRage, type DdsFormat, type RageTexture } from "./rage";

export type TextureRole = "diffuse" | "normal" | "spec" | "rough" | "metal" | "ao" | "emissive";

const ROLE_SUFFIXES: [RegExp, TextureRole][] = [
  [/(_n|_nrm|_norm|_normal|_nm)$/i, "normal"],
  [/(_s|_spec|_specular|_gloss)$/i, "spec"],
  [/(_r|_rough|_roughness)$/i, "rough"],
  [/(_m|_metal|_metallic|_metalness)$/i, "metal"],
  [/(_ao|_occlusion|_occ)$/i, "ao"],
  [/(_e|_emis|_emissive|_glow)$/i, "emissive"],
  [/(_d|_diff|_diffuse|_albedo|_basecolor|_base_color|_col|_color)$/i, "diffuse"],
];

/** Classify a texture by its filename suffix (the convention most model packs use). */
export function detectTextureRole(fileName: string): TextureRole {
  const base = path.basename(fileName).replace(/\.[^.]+$/, "");
  for (const [re, role] of ROLE_SUFFIXES) if (re.test(base)) return role;
  return "diffuse";
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Buffer; // RGBA8
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function previousPowerOfTwo(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/** Round to the nearest power of two, clamped to [min, max]. */
export function clampPowerOfTwo(n: number, min = 4, max = 4096): number {
  const up = nextPowerOfTwo(n);
  const down = previousPowerOfTwo(n);
  const best = up - n <= n - down ? up : down;
  return Math.max(min, Math.min(max, best));
}

export async function readImage(input: string | Buffer): Promise<sharp.Sharp> {
  const buf = typeof input === "string" ? await readFile(input) : input;
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "DDS ") {
    const rgba = await ddsToRgba(buf);
    return sharp(rgba.data, { raw: { width: rgba.width, height: rgba.height, channels: 4 } });
  }
  return sharp(buf, { limitInputPixels: 268_435_456 });
}

/** Decode any supported image (PNG/JPG/WEBP/DDS) into RGBA, resized to a power-of-two square-ish size. */
export async function toRgba(input: string | Buffer, opts: { maxSize?: number; forceSize?: number; powerOfTwo?: boolean } = {}): Promise<RgbaImage> {
  const img = await readImage(input);
  const meta = await img.metadata();
  let width = meta.width ?? 0;
  let height = meta.height ?? 0;
  if (!width || !height) throw new ProcessingError("INVALID_IMAGE", "Could not read image dimensions");
  if (opts.forceSize) {
    width = height = opts.forceSize;
  } else {
    if (opts.powerOfTwo !== false) {
      width = clampPowerOfTwo(width);
      height = clampPowerOfTwo(height);
    }
    const max = opts.maxSize ?? 2048;
    while (width > max || height > max) {
      width = Math.max(4, width / 2);
      height = Math.max(4, height / 2);
    }
  }
  const { data, info } = await img.resize(Math.round(width), Math.round(height), { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

/** True when any pixel is not fully opaque (decides DXT1 vs DXT5). */
export function hasAlpha(img: RgbaImage): boolean {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < 250) return true;
  return false;
}

export function pickDdsFormat(img: RgbaImage, role: TextureRole): DdsFormat {
  if (role === "normal") return "DXT5"; // preserve gradients
  return hasAlpha(img) ? "DXT5" : "DXT1";
}

/** Full mip chain (each level halved) as RGBA buffers. */
export async function mipChain(img: RgbaImage): Promise<RgbaImage[]> {
  const out: RgbaImage[] = [img];
  let w = img.width;
  let h = img.height;
  let cur = img;
  while (w > 1 || h > 1) {
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
    const { data, info } = await sharp(cur.data, { raw: { width: cur.width, height: cur.height, channels: 4 } })
      .resize(w, h, { fit: "fill", kernel: "lanczos3" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    cur = { width: info.width, height: info.height, data };
    out.push(cur);
  }
  return out;
}

export function mipCount(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

/** Encode RGBA to a DDS buffer with a mip chain via the rage encoder. */
export async function encodeDds(img: RgbaImage, format: DdsFormat, mips = true): Promise<Buffer> {
  const rage = await requireRage();
  if (typeof rage.encodeDds !== "function") {
    throw new ProcessingError("RAGE_UNSUPPORTED", "The DDS encoder is unavailable on this worker", { infrastructure: true, retryable: true });
  }
  return rage.encodeDds(new Uint8Array(img.data), img.width, img.height, { format, mips });
}

export async function ddsToRgba(dds: Buffer, level = 0): Promise<RgbaImage> {
  const rage = await requireRage();
  if (typeof rage.decodeDds !== "function") throw new ProcessingError("RAGE_UNSUPPORTED", "The DDS decoder is unavailable on this worker", { infrastructure: true, retryable: true });
  const decoded = rage.decodeDds(dds);
  const data = decoded.rgba(level);
  if (!data) throw new ProcessingError("UNSUPPORTED_TEXTURE_FORMAT", `This build cannot decode ${decoded.format} textures`);
  const size = decoded.levelSize(level);
  return { width: size.width, height: size.height, data: Buffer.from(data) };
}

export interface PreparedTexture {
  name: string;
  role: TextureRole;
  width: number;
  height: number;
  format: DdsFormat;
  mips: number;
  dds: Buffer;
  vramBytes: number;
}

export function vramForTexture(width: number, height: number, format: string, mips: number): number {
  const fmt = format.toUpperCase();
  const bytesPerPixel = fmt.includes("DXT1") || fmt.includes("BC1") ? 0.5 : fmt.includes("DXT") || fmt.includes("BC3") || fmt.includes("BC2") ? 1 : 4;
  let total = 0;
  let w = width;
  let h = height;
  for (let i = 0; i < Math.max(1, mips); i++) {
    total += Math.max(1, w) * Math.max(1, h) * bytesPerPixel;
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
  }
  return Math.ceil(total);
}

/** Decode → resize → DXT-encode a source image for a .ytd entry. */
export async function prepareTexture(input: string | Buffer, name: string, opts: { maxSize?: number; role?: TextureRole; format?: DdsFormat; mips?: boolean } = {}): Promise<PreparedTexture> {
  const role = opts.role ?? detectTextureRole(typeof input === "string" ? input : name);
  const img = await toRgba(input, { maxSize: opts.maxSize ?? 2048 });
  const format = opts.format ?? pickDdsFormat(img, role);
  const mips = opts.mips === false ? 1 : mipCount(img.width, img.height);
  const dds = await encodeDds(img, format, opts.mips !== false);
  return { name: sanitizeTextureName(name), role, width: img.width, height: img.height, format, mips, dds, vramBytes: vramForTexture(img.width, img.height, format, mips) };
}

export function sanitizeTextureName(name: string): string {
  const base = path.basename(name).replace(/\.[^.]+$/, "");
  return base.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "texture";
}

/** Build a .ytd from prepared textures (native writer; throws when unavailable). */
export async function buildYtd(textures: { name: string; dds: Buffer }[]): Promise<Buffer> {
  const rage = await requireRage();
  if (typeof rage.writeYtd !== "function") {
    throw new ProcessingError("RAGE_UNSUPPORTED", "This worker cannot write texture dictionaries yet", { infrastructure: true, retryable: true });
  }
  return rage.writeYtd(textures.map((t) => ({ name: sanitizeTextureName(t.name), dds: t.dds })));
}

/** Read a .ytd; returns [] when the rage reader is unavailable. */
export async function readYtdTextures(buf: Buffer): Promise<RageTexture[]> {
  const rage = await loadRage();
  if (!rage?.readYtd) return [];
  return rage.readYtd(buf);
}

/** Convert a RAGE texture to a PNG buffer (inspect artifacts). */
export async function rageTextureToPng(tex: RageTexture): Promise<Buffer | null> {
  const rgba = tex.rgba(0);
  if (!rgba) return null;
  return sharp(Buffer.from(rgba.data), { raw: { width: rgba.width, height: rgba.height, channels: 4 } }).png().toBuffer();
}

export interface ImageAdjustments {
  brightness?: number; // -1..1
  contrast?: number; // -1..1
  saturation?: number; // -1..1
  hue?: number; // degrees
}

/** Apply the editor's colour adjustments with sharp (modulate + linear contrast). */
export function applyAdjustments(img: sharp.Sharp, adj: ImageAdjustments): sharp.Sharp {
  const brightness = 1 + (adj.brightness ?? 0);
  const saturation = 1 + (adj.saturation ?? 0);
  const hue = Math.round(adj.hue ?? 0);
  let out = img.modulate({ brightness: Math.max(0.01, brightness), saturation: Math.max(0, saturation), hue });
  const c = adj.contrast ?? 0;
  if (c !== 0) {
    const a = 1 + c;
    const b = 128 * (1 - a);
    out = out.linear(a, b);
  }
  return out;
}

export interface PlacementTransform {
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  fit?: "stretch" | "contain" | "cover";
}

/** Place a replacement image into a target-size canvas honouring scale/offset/rotation/fit. */
export async function placeImage(input: string | Buffer, target: { width: number; height: number }, transform: PlacementTransform, adjustments?: ImageAdjustments): Promise<RgbaImage> {
  const scale = Math.max(0.01, transform.scale ?? 1);
  const fit = transform.fit ?? "stretch";
  let img = await readImage(input);
  if (transform.rotation) img = sharp(await img.rotate(transform.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer());
  if (adjustments) img = applyAdjustments(img, adjustments);
  const innerW = Math.max(1, Math.round(target.width * scale));
  const innerH = Math.max(1, Math.round(target.height * scale));
  const resized = await img
    .resize(innerW, innerH, { fit: fit === "stretch" ? "fill" : fit === "contain" ? "inside" : "cover", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();
  const left = Math.round(((target.width - innerW) / 2) + (transform.offsetX ?? 0) * target.width);
  const top = Math.round(((target.height - innerH) / 2) + (transform.offsetY ?? 0) * target.height);
  const { data, info } = await sharp({ create: { width: target.width, height: target.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left, top }])
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

export async function rgbaToPng(img: RgbaImage): Promise<Buffer> {
  return sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer();
}

/** A flat tangent-space normal map (used where a normal texture is required but absent). */
export async function flatNormalDds(size = 256): Promise<Buffer> {
  const data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = 128;
    data[i * 4 + 1] = 128;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  return encodeDds({ width: size, height: size, data }, "DXT5", true);
}

/** A solid colour texture (materials without maps still need a diffuse in RAGE). */
export async function solidColorRgba(hexOrRgb: string | [number, number, number], size = 64, alpha = 255): Promise<RgbaImage> {
  let r = 200, g = 200, b = 200;
  if (typeof hexOrRgb === "string") {
    const m = /^#?([0-9a-f]{6})$/i.exec(hexOrRgb.trim());
    if (m) {
      const v = parseInt(m[1]!, 16);
      r = (v >> 16) & 255;
      g = (v >> 8) & 255;
      b = v & 255;
    }
  } else {
    [r, g, b] = hexOrRgb;
  }
  const data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = alpha;
  }
  return { width: size, height: size, data };
}
