/**
 * Minimal PNG encoder (RGBA8, non-interlaced, zlib-deflated IDAT).
 *
 * Exists so decoded RAGE textures can be embedded in GLB previews and written
 * as job artifacts without pulling in an image library.
 *
 * Verified: output is checked against the PNG signature, chunk layout and CRCs
 * in the unit tests, and decoded back through a small test-only reader.
 *
 * @packageDocumentation
 */

import { deflateSync } from "node:zlib";
import { RageFormatError } from "./errors.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 as specified by PNG (ISO 3309). */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Paeth predictor from the PNG filtering spec. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Encode tightly-packed RGBA8 pixels as a PNG file.
 *
 * Each scanline is filtered with the heuristic from the PNG spec (pick the
 * filter whose output has the smallest sum of absolute differences), then the
 * whole stream is zlib-deflated into a single IDAT chunk.
 *
 * @param rgba - `width * height * 4` bytes.
 * @throws {@link RageFormatError} for bad dimensions or a short buffer.
 */
export function encodePng(rgba: Uint8Array, width: number, height: number): Buffer {
  if (width <= 0 || height <= 0) {
    throw new RageFormatError(`PNG dimensions must be positive, got ${width}×${height}`, {
      code: "BAD_INPUT",
    });
  }
  if (rgba.length < width * height * 4) {
    throw new RageFormatError(
      `PNG pixel buffer is ${rgba.length} bytes, expected ${width * height * 4}`,
      { code: "BAD_INPUT" },
    );
  }

  const bpp = 4;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  const prior = new Uint8Array(stride);
  const line = new Uint8Array(stride);
  const candidates = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];

  for (let y = 0; y < height; y++) {
    for (let i = 0; i < stride; i++) line[i] = rgba[y * stride + i]!;

    for (let i = 0; i < stride; i++) {
      const x = line[i]!;
      const a = i >= bpp ? line[i - bpp]! : 0;
      const b = prior[i]!;
      const c = i >= bpp ? prior[i - bpp]! : 0;
      candidates[0]![i] = x;
      candidates[1]![i] = (x - a) & 0xff;
      candidates[2]![i] = (x - b) & 0xff;
      candidates[3]![i] = (x - ((a + b) >> 1)) & 0xff;
      candidates[4]![i] = (x - paeth(a, b, c)) & 0xff;
    }

    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      const cand = candidates[f]!;
      for (let i = 0; i < stride; i++) {
        const v = cand[i]!;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }

    const rowOffset = y * (stride + 1);
    raw[rowOffset] = best;
    raw.set(candidates[best]!, rowOffset + 1);
    prior.set(line);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** True when `buf` starts with the 8-byte PNG signature. */
export function isPng(buf: Buffer | Uint8Array): boolean {
  if (buf.length < 8) return false;
  return PNG_SIGNATURE.equals(Buffer.from(buf.buffer, buf.byteOffset, 8));
}
