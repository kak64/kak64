/**
 * DDS (DirectDraw Surface) reading and writing.
 *
 * Supports the subset of DDS that GTA V textures use: DXT1/DXT3/DXT5, BC4/BC5,
 * BC7 (via the DX10 extension header), plus uncompressed A8R8G8B8, A8 and L8.
 *
 * Verified: header field layout and the `encodeDds → decodeDds` round trip are
 * unit-tested, including mip chain sizes and PSNR of the block codecs.
 *
 * @packageDocumentation
 */

import { RageFormatError, RageUnsupportedError } from "./errors.js";
import { decodeBc1, decodeBc2, decodeBc3, encodeBc1, encodeBc3 } from "./bc.js";

/** Texture formats this library names. */
export type KnownTextureFormat =
  | "DXT1"
  | "DXT3"
  | "DXT5"
  | "BC4"
  | "BC5"
  | "BC7"
  | "A8R8G8B8"
  | "A8"
  | "L8";

/**
 * A texture format name. Unknown D3D/DXGI codes are surfaced as a hex string
 * such as `"0x0000004d"` so callers can report them rather than guess.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type TextureFormat = KnownTextureFormat | (string & {});

/** `'DDS '` little-endian magic. */
export const DDS_MAGIC = 0x20534444;
/** Size of the magic + DDS_HEADER. */
export const DDS_HEADER_SIZE = 128;
/** Size of the DDS_HEADER_DXT10 extension. */
export const DDS_DX10_HEADER_SIZE = 20;

const DDSD_CAPS = 0x1;
const DDSD_HEIGHT = 0x2;
const DDSD_WIDTH = 0x4;
const DDSD_PITCH = 0x8;
const DDSD_PIXELFORMAT = 0x1000;
const DDSD_MIPMAPCOUNT = 0x20000;
const DDSD_LINEARSIZE = 0x80000;

const DDPF_ALPHAPIXELS = 0x1;
const DDPF_ALPHA = 0x2;
const DDPF_FOURCC = 0x4;
const DDPF_RGB = 0x40;
const DDPF_LUMINANCE = 0x20000;

const DDSCAPS_COMPLEX = 0x8;
const DDSCAPS_MIPMAP = 0x400;
const DDSCAPS_TEXTURE = 0x1000;

function fourCC(s: string): number {
  return (
    (s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24)) >>>
    0
  );
}

/** DXGI format codes used by the DX10 header. */
export const DXGI = {
  R8G8B8A8_UNORM: 28,
  R8_UNORM: 61,
  A8_UNORM: 65,
  BC1_UNORM: 71,
  BC1_UNORM_SRGB: 72,
  BC2_UNORM: 74,
  BC2_UNORM_SRGB: 75,
  BC3_UNORM: 77,
  BC3_UNORM_SRGB: 78,
  BC4_UNORM: 80,
  BC5_UNORM: 83,
  B8G8R8A8_UNORM: 87,
  BC7_UNORM: 98,
  BC7_UNORM_SRGB: 99,
} as const;

/** Map a DXGI code to a {@link TextureFormat}. */
export function formatFromDxgi(code: number): TextureFormat {
  switch (code) {
    case DXGI.BC1_UNORM:
    case DXGI.BC1_UNORM_SRGB:
      return "DXT1";
    case DXGI.BC2_UNORM:
    case DXGI.BC2_UNORM_SRGB:
      return "DXT3";
    case DXGI.BC3_UNORM:
    case DXGI.BC3_UNORM_SRGB:
      return "DXT5";
    case DXGI.BC4_UNORM:
      return "BC4";
    case DXGI.BC5_UNORM:
      return "BC5";
    case DXGI.BC7_UNORM:
    case DXGI.BC7_UNORM_SRGB:
      return "BC7";
    case DXGI.B8G8R8A8_UNORM:
    case DXGI.R8G8B8A8_UNORM:
      return "A8R8G8B8";
    case DXGI.A8_UNORM:
      return "A8";
    case DXGI.R8_UNORM:
      return "L8";
    default:
      return `0x${(code >>> 0).toString(16).padStart(8, "0")}`;
  }
}

/** Map a {@link TextureFormat} to the DXGI code used in a DX10 header. */
export function dxgiFromFormat(format: TextureFormat): number {
  switch (format) {
    case "DXT1":
      return DXGI.BC1_UNORM;
    case "DXT3":
      return DXGI.BC2_UNORM;
    case "DXT5":
      return DXGI.BC3_UNORM;
    case "BC4":
      return DXGI.BC4_UNORM;
    case "BC5":
      return DXGI.BC5_UNORM;
    case "BC7":
      return DXGI.BC7_UNORM;
    case "A8R8G8B8":
      return DXGI.B8G8R8A8_UNORM;
    case "A8":
      return DXGI.A8_UNORM;
    case "L8":
      return DXGI.R8_UNORM;
    default:
      return 0;
  }
}

/** True when the format stores 4×4 blocks rather than individual texels. */
export function isBlockCompressed(format: TextureFormat): boolean {
  return (
    format === "DXT1" ||
    format === "DXT3" ||
    format === "DXT5" ||
    format === "BC4" ||
    format === "BC5" ||
    format === "BC7"
  );
}

/** Bytes per 4×4 block, or 0 for uncompressed formats. */
export function blockBytes(format: TextureFormat): number {
  if (format === "DXT1" || format === "BC4") return 8;
  if (format === "DXT3" || format === "DXT5" || format === "BC5" || format === "BC7") return 16;
  return 0;
}

/** Bits per pixel for an uncompressed format, or 0 for block formats. */
export function bitsPerPixel(format: TextureFormat): number {
  if (format === "A8R8G8B8") return 32;
  if (format === "A8" || format === "L8") return 8;
  if (format === "DXT1" || format === "BC4") return 4;
  if (isBlockCompressed(format)) return 8;
  return 0;
}

/**
 * Size in bytes of one mip surface.
 *
 * @throws {@link RageUnsupportedError} for a format with no known size rule.
 */
export function surfaceSize(format: TextureFormat, width: number, height: number): number {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (isBlockCompressed(format)) {
    return Math.ceil(w / 4) * Math.ceil(h / 4) * blockBytes(format);
  }
  const bpp = bitsPerPixel(format);
  if (bpp === 0) {
    throw new RageUnsupportedError(`cannot compute surface size for format ${format}`, {
      code: "UNKNOWN_FORMAT",
    });
  }
  return (w * h * bpp) / 8;
}

/** Row pitch in bytes for a mip surface. */
export function rowPitch(format: TextureFormat, width: number): number {
  const w = Math.max(1, width);
  if (isBlockCompressed(format)) return Math.ceil(w / 4) * blockBytes(format);
  return (w * bitsPerPixel(format)) / 8;
}

/** Total size of a full mip chain (`levels` surfaces starting at w×h). */
export function mipChainSize(
  format: TextureFormat,
  width: number,
  height: number,
  levels: number,
): number {
  let total = 0;
  for (let i = 0; i < levels; i++) {
    total += surfaceSize(format, Math.max(1, width >> i), Math.max(1, height >> i));
  }
  return total;
}

/** Number of mip levels in a full chain for `width` × `height`. */
export function fullMipCount(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(1, Math.max(width, height)))) + 1;
}

/** A decoded DDS file. */
export interface DecodedDds {
  width: number;
  height: number;
  depth: number;
  format: TextureFormat;
  /** Number of mip levels present in the file (at least 1). */
  mips: number;
  /** Raw pixel/block payload for all mip levels, tightly packed. */
  data: Buffer;
  /** Raw bytes of one mip level. */
  levelData(level: number): Buffer;
  /** Pixel dimensions of one mip level. */
  levelSize(level: number): { width: number; height: number };
  /**
   * Decode a mip level to tightly-packed RGBA8.
   *
   * @returns `null` when the format has no decoder in this library (BC7, BC5,
   *   BC4 and unknown codes).
   */
  rgba(level?: number): Uint8Array | null;
}

function pixelFormatToFormat(
  flags: number,
  fcc: number,
  rgbBitCount: number,
  rMask: number,
  gMask: number,
  bMask: number,
  aMask: number,
): TextureFormat {
  if (flags & DDPF_FOURCC) {
    switch (fcc) {
      case fourCC("DXT1"):
        return "DXT1";
      case fourCC("DXT2"):
      case fourCC("DXT3"):
        return "DXT3";
      case fourCC("DXT4"):
      case fourCC("DXT5"):
        return "DXT5";
      case fourCC("ATI1"):
      case fourCC("BC4U"):
        return "BC4";
      case fourCC("ATI2"):
      case fourCC("BC5U"):
        return "BC5";
      default:
        return `0x${(fcc >>> 0).toString(16).padStart(8, "0")}`;
    }
  }
  if (flags & DDPF_RGB) {
    if (rgbBitCount === 32 && rMask === 0x00ff0000 && gMask === 0x0000ff00 && bMask === 0x000000ff) {
      return "A8R8G8B8";
    }
    if (rgbBitCount === 32 && rMask === 0x000000ff && gMask === 0x0000ff00 && bMask === 0x00ff0000) {
      // R8G8B8A8; we normalise to A8R8G8B8 on read by swizzling in rgba().
      return "A8R8G8B8";
    }
    return `rgb${rgbBitCount}`;
  }
  if (flags & DDPF_LUMINANCE) return "L8";
  if (flags & DDPF_ALPHA) return "A8";
  void aMask;
  return "unknown";
}

/**
 * Parse a DDS file.
 *
 * @throws {@link RageFormatError} for a short buffer, wrong magic or a header
 *   that does not describe a 2D texture this library can size.
 */
export function decodeDds(buf: Buffer | Uint8Array): DecodedDds {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length < DDS_HEADER_SIZE) {
    throw new RageFormatError(`DDS buffer is only ${b.length} bytes (need at least 128)`, {
      code: "TRUNCATED",
    });
  }
  if (b.readUInt32LE(0) !== DDS_MAGIC) {
    throw new RageFormatError("not a DDS file (missing 'DDS ' magic)", { code: "BAD_MAGIC" });
  }
  const headerSize = b.readUInt32LE(4);
  if (headerSize !== 124) {
    throw new RageFormatError(`DDS header size is ${headerSize}, expected 124`, {
      code: "BAD_HEADER",
      offset: 4,
    });
  }
  const flags = b.readUInt32LE(8);
  const height = b.readUInt32LE(12);
  const width = b.readUInt32LE(16);
  const depth = Math.max(1, b.readUInt32LE(24));
  const declaredMips = b.readUInt32LE(28);

  const pfFlags = b.readUInt32LE(0x50);
  const pfFourCC = b.readUInt32LE(0x54);
  const pfBits = b.readUInt32LE(0x58);
  const pfR = b.readUInt32LE(0x5c);
  const pfG = b.readUInt32LE(0x60);
  const pfB = b.readUInt32LE(0x64);
  const pfA = b.readUInt32LE(0x68);

  let format = pixelFormatToFormat(pfFlags, pfFourCC, pfBits, pfR, pfG, pfB, pfA);
  let dataOffset = DDS_HEADER_SIZE;

  if (pfFlags & DDPF_FOURCC && pfFourCC === fourCC("DX10")) {
    if (b.length < DDS_HEADER_SIZE + DDS_DX10_HEADER_SIZE) {
      throw new RageFormatError("DDS declares a DX10 header but the buffer is too short", {
        code: "TRUNCATED",
        offset: DDS_HEADER_SIZE,
      });
    }
    const dxgiFormat = b.readUInt32LE(DDS_HEADER_SIZE);
    format = formatFromDxgi(dxgiFormat);
    dataOffset = DDS_HEADER_SIZE + DDS_DX10_HEADER_SIZE;
  }

  if (width <= 0 || height <= 0) {
    throw new RageFormatError(`DDS has invalid dimensions ${width}×${height}`, {
      code: "BAD_HEADER",
    });
  }

  const mips = flags & DDSD_MIPMAPCOUNT ? Math.max(1, declaredMips) : Math.max(1, declaredMips || 1);
  const data = b.subarray(dataOffset);

  let expected: number;
  try {
    expected = mipChainSize(format, width, height, mips);
  } catch {
    expected = 0;
  }
  if (expected > 0 && data.length < expected) {
    throw new RageFormatError(
      `DDS payload is ${data.length} bytes but ${mips} mip level(s) of ${width}×${height} ${format} need ${expected}`,
      { code: "TRUNCATED_PAYLOAD", offset: dataOffset },
    );
  }

  const levelSize = (level: number) => ({
    width: Math.max(1, width >> level),
    height: Math.max(1, height >> level),
  });

  const levelData = (level: number): Buffer => {
    if (level < 0 || level >= mips) {
      throw new RageFormatError(`mip level ${level} is out of range (0…${mips - 1})`, {
        code: "BAD_LEVEL",
      });
    }
    let off = 0;
    for (let i = 0; i < level; i++) {
      const s = levelSize(i);
      off += surfaceSize(format, s.width, s.height);
    }
    const s = levelSize(level);
    return data.subarray(off, off + surfaceSize(format, s.width, s.height));
  };

  const isBgra = (pfFlags & DDPF_RGB) !== 0 && pfR === 0x00ff0000;

  return {
    width,
    height,
    depth,
    format,
    mips,
    data,
    levelData,
    levelSize,
    rgba(level = 0) {
      const s = levelSize(level);
      return surfaceToRgba(format, levelData(level), s.width, s.height, isBgra);
    },
  };
}

/**
 * Decode one surface to tightly-packed RGBA8.
 *
 * @param bgra - For `A8R8G8B8`, whether the stored order is BGRA (the normal
 *   DDS/D3D order) rather than RGBA.
 * @returns `null` for formats with no decoder (BC4, BC5, BC7, unknown).
 */
export function surfaceToRgba(
  format: TextureFormat,
  data: Uint8Array,
  width: number,
  height: number,
  bgra = true,
): Uint8Array | null {
  switch (format) {
    case "DXT1":
      return decodeBc1(data, width, height);
    case "DXT3":
      return decodeBc2(data, width, height);
    case "DXT5":
      return decodeBc3(data, width, height);
    case "A8R8G8B8": {
      const out = new Uint8Array(width * height * 4);
      const n = Math.min(width * height, Math.floor(data.length / 4));
      for (let i = 0; i < n; i++) {
        const s = i * 4;
        if (bgra) {
          out[i * 4] = data[s + 2]!;
          out[i * 4 + 1] = data[s + 1]!;
          out[i * 4 + 2] = data[s]!;
          out[i * 4 + 3] = data[s + 3]!;
        } else {
          out[i * 4] = data[s]!;
          out[i * 4 + 1] = data[s + 1]!;
          out[i * 4 + 2] = data[s + 2]!;
          out[i * 4 + 3] = data[s + 3]!;
        }
      }
      return out;
    }
    case "L8": {
      const out = new Uint8Array(width * height * 4);
      const n = Math.min(width * height, data.length);
      for (let i = 0; i < n; i++) {
        const v = data[i]!;
        out[i * 4] = v;
        out[i * 4 + 1] = v;
        out[i * 4 + 2] = v;
        out[i * 4 + 3] = 255;
      }
      return out;
    }
    case "A8": {
      const out = new Uint8Array(width * height * 4);
      const n = Math.min(width * height, data.length);
      for (let i = 0; i < n; i++) {
        out[i * 4] = 255;
        out[i * 4 + 1] = 255;
        out[i * 4 + 2] = 255;
        out[i * 4 + 3] = data[i]!;
      }
      return out;
    }
    default:
      return null;
  }
}

/** Options for {@link encodeDds}. */
export interface EncodeDdsOptions {
  /** Target format. */
  format: "DXT1" | "DXT5" | "A8R8G8B8" | "L8" | "A8";
  /**
   * Generate a full mip chain (box filter). A number caps the level count.
   * Default `false` (single level).
   */
  mips?: boolean | number;
  /** For DXT1, encode texels with alpha &lt; 128 using punch-through alpha. */
  punchThroughAlpha?: boolean;
}

/** Box-filter `src` (RGBA) down to half size, rounding dimensions down to ≥1. */
export function downsampleRgba(
  src: Uint8Array,
  width: number,
  height: number,
): { data: Uint8Array; width: number; height: number } {
  const dw = Math.max(1, width >> 1);
  const dh = Math.max(1, height >> 1);
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.min(y * 2, height - 1);
    const y1 = Math.min(y * 2 + 1, height - 1);
    for (let x = 0; x < dw; x++) {
      const x0 = Math.min(x * 2, width - 1);
      const x1 = Math.min(x * 2 + 1, width - 1);
      const o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const s =
          src[(y0 * width + x0) * 4 + c]! +
          src[(y0 * width + x1) * 4 + c]! +
          src[(y1 * width + x0) * 4 + c]! +
          src[(y1 * width + x1) * 4 + c]!;
        out[o + c] = Math.round(s / 4);
      }
    }
  }
  return { data: out, width: dw, height: dh };
}

/** Build a full RGBA mip chain by repeated box filtering. */
export function buildMipChain(
  rgba: Uint8Array,
  width: number,
  height: number,
  maxLevels = Infinity,
): Array<{ data: Uint8Array; width: number; height: number }> {
  const levels = [{ data: rgba, width, height }];
  const limit = Math.min(maxLevels, fullMipCount(width, height));
  let cur = levels[0]!;
  while (levels.length < limit && (cur.width > 1 || cur.height > 1)) {
    cur = downsampleRgba(cur.data, cur.width, cur.height);
    levels.push(cur);
  }
  return levels;
}

/** Encode one RGBA surface into `format`'s raw bytes. */
function encodeSurface(
  format: EncodeDdsOptions["format"],
  rgba: Uint8Array,
  width: number,
  height: number,
  punchThroughAlpha: boolean,
): Uint8Array {
  switch (format) {
    case "DXT1":
      return encodeBc1(rgba, width, height, punchThroughAlpha);
    case "DXT5":
      return encodeBc3(rgba, width, height);
    case "A8R8G8B8": {
      const out = new Uint8Array(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        out[i * 4] = rgba[i * 4 + 2]!; // B
        out[i * 4 + 1] = rgba[i * 4 + 1]!; // G
        out[i * 4 + 2] = rgba[i * 4]!; // R
        out[i * 4 + 3] = rgba[i * 4 + 3]!; // A
      }
      return out;
    }
    case "L8": {
      const out = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i++) {
        out[i] = Math.round(
          0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!,
        );
      }
      return out;
    }
    case "A8": {
      const out = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i++) out[i] = rgba[i * 4 + 3]!;
      return out;
    }
  }
}

/** Options for {@link buildDdsHeader}. */
export interface DdsHeaderOptions {
  width: number;
  height: number;
  mips: number;
  format: TextureFormat;
  /** Force the DX10 extension header (always used for BC7). */
  dx10?: boolean;
  /** Size of the largest mip surface, for the pitch/linear-size field. */
  linearSize?: number;
}

/**
 * Build the DDS magic + `DDS_HEADER` (+ `DDS_HEADER_DXT10` when required).
 *
 * BC7 always gets a DX10 header because there is no legacy FourCC for it.
 */
export function buildDdsHeader(options: DdsHeaderOptions): Buffer {
  const { width, height, mips, format } = options;
  const useDx10 = options.dx10 === true || format === "BC7";
  const header = Buffer.alloc(DDS_HEADER_SIZE + (useDx10 ? DDS_DX10_HEADER_SIZE : 0));
  header.writeUInt32LE(DDS_MAGIC, 0);
  header.writeUInt32LE(124, 4);

  const compressed = isBlockCompressed(format);
  let flags = DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT;
  flags |= compressed ? DDSD_LINEARSIZE : DDSD_PITCH;
  if (mips > 1) flags |= DDSD_MIPMAPCOUNT;
  header.writeUInt32LE(flags, 8);
  header.writeUInt32LE(height, 12);
  header.writeUInt32LE(width, 16);
  const pitchOrLinear =
    options.linearSize ?? (compressed ? surfaceSize(format, width, height) : rowPitch(format, width));
  header.writeUInt32LE(pitchOrLinear, 20);
  header.writeUInt32LE(0, 24); // depth
  header.writeUInt32LE(mips, 28);

  // DDS_PIXELFORMAT at 0x4C
  header.writeUInt32LE(32, 0x4c);
  if (useDx10) {
    header.writeUInt32LE(DDPF_FOURCC, 0x50);
    header.writeUInt32LE(fourCC("DX10"), 0x54);
  } else if (compressed) {
    header.writeUInt32LE(DDPF_FOURCC, 0x50);
    const fcc =
      format === "DXT1"
        ? "DXT1"
        : format === "DXT3"
          ? "DXT3"
          : format === "DXT5"
            ? "DXT5"
            : format === "BC4"
              ? "ATI1"
              : "ATI2";
    header.writeUInt32LE(fourCC(fcc), 0x54);
  } else if (format === "A8R8G8B8") {
    header.writeUInt32LE(DDPF_RGB | DDPF_ALPHAPIXELS, 0x50);
    header.writeUInt32LE(0, 0x54);
    header.writeUInt32LE(32, 0x58);
    header.writeUInt32LE(0x00ff0000, 0x5c);
    header.writeUInt32LE(0x0000ff00, 0x60);
    header.writeUInt32LE(0x000000ff, 0x64);
    header.writeUInt32LE(0xff000000, 0x68);
  } else if (format === "L8") {
    header.writeUInt32LE(DDPF_LUMINANCE, 0x50);
    header.writeUInt32LE(0, 0x54);
    header.writeUInt32LE(8, 0x58);
    header.writeUInt32LE(0xff, 0x5c);
  } else if (format === "A8") {
    header.writeUInt32LE(DDPF_ALPHA, 0x50);
    header.writeUInt32LE(0, 0x54);
    header.writeUInt32LE(8, 0x58);
    header.writeUInt32LE(0, 0x5c);
    header.writeUInt32LE(0, 0x60);
    header.writeUInt32LE(0, 0x64);
    header.writeUInt32LE(0xff, 0x68);
  } else {
    throw new RageUnsupportedError(`cannot write a DDS header for format ${format}`, {
      code: "UNKNOWN_FORMAT",
    });
  }

  let caps = DDSCAPS_TEXTURE;
  if (mips > 1) caps |= DDSCAPS_COMPLEX | DDSCAPS_MIPMAP;
  header.writeUInt32LE(caps, 0x6c);

  if (useDx10) {
    header.writeUInt32LE(dxgiFromFormat(format), DDS_HEADER_SIZE);
    header.writeUInt32LE(3, DDS_HEADER_SIZE + 4); // D3D10_RESOURCE_DIMENSION_TEXTURE2D
    header.writeUInt32LE(0, DDS_HEADER_SIZE + 8); // miscFlag
    header.writeUInt32LE(1, DDS_HEADER_SIZE + 12); // arraySize
    header.writeUInt32LE(0, DDS_HEADER_SIZE + 16); // miscFlags2
  }
  return header;
}

/**
 * Assemble a DDS file from already-encoded mip surfaces.
 *
 * @param mipData - Raw surfaces, largest first.
 */
export function assembleDds(
  format: TextureFormat,
  width: number,
  height: number,
  mipData: Array<Buffer | Uint8Array>,
  options: { dx10?: boolean } = {},
): Buffer {
  const header = buildDdsHeader({
    width,
    height,
    mips: Math.max(1, mipData.length),
    format,
    ...(options.dx10 !== undefined ? { dx10: options.dx10 } : {}),
  });
  return Buffer.concat([header, ...mipData.map((d) => Buffer.from(d))]);
}

/**
 * Encode an RGBA image as a DDS file.
 *
 * @param rgba - Tightly packed RGBA8, `width * height * 4` bytes.
 * @throws {@link RageFormatError} when `rgba` is the wrong length.
 */
export function encodeDds(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: EncodeDdsOptions,
): Buffer {
  if (rgba.length < width * height * 4) {
    throw new RageFormatError(
      `rgba buffer is ${rgba.length} bytes, expected ${width * height * 4} for ${width}×${height}`,
      { code: "BAD_INPUT" },
    );
  }
  const maxLevels =
    options.mips === true ? Infinity : typeof options.mips === "number" ? options.mips : 1;
  const levels = buildMipChain(rgba, width, height, maxLevels);
  const surfaces = levels.map((l) =>
    encodeSurface(options.format, l.data, l.width, l.height, options.punchThroughAlpha ?? false),
  );
  return assembleDds(options.format, width, height, surfaces);
}
