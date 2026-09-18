import { describe, expect, it } from "vitest";
import {
  assembleDds,
  buildMipChain,
  decodeDds,
  DDS_HEADER_SIZE,
  downsampleRgba,
  encodeDds,
  fullMipCount,
  mipChainSize,
  rowPitch,
  surfaceSize,
} from "./dds.js";
import {
  decodeBc1,
  decodeBc1Block,
  decodeBc2,
  decodeBc3,
  decodeBc3AlphaBlock,
  encodeBc1,
  encodeBc3,
  packRgb565,
  unpackRgb565,
} from "./bc.js";
import { RageFormatError } from "./errors.js";

/** Peak signal-to-noise ratio between two RGBA buffers, in dB. */
function psnr(a: Uint8Array, b: Uint8Array): number {
  let mse = 0;
  for (let i = 0; i < a.length; i++) mse += (a[i]! - b[i]!) ** 2;
  mse /= a.length;
  if (mse === 0) return Infinity;
  return 10 * Math.log10((255 * 255) / mse);
}

/** Deterministic smooth test image. */
function gradient(w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[i] = Math.round((255 * x) / Math.max(1, w - 1));
      out[i + 1] = Math.round((255 * y) / Math.max(1, h - 1));
      out[i + 2] = Math.round((255 * (x + y)) / Math.max(1, w + h - 2));
      out[i + 3] = 255;
    }
  }
  return out;
}

describe("RGB565 packing", () => {
  it("round-trips the representable values", () => {
    const [r, g, b] = unpackRgb565(packRgb565(255, 128, 0));
    expect(r).toBe(255);
    expect(g).toBeGreaterThanOrEqual(128 - 4);
    expect(g).toBeLessThanOrEqual(128 + 4);
    expect(b).toBe(0);
    expect(unpackRgb565(0)).toEqual([0, 0, 0]);
    expect(unpackRgb565(0xffff)).toEqual([255, 255, 255]);
  });
});

describe("BC1 decoding (hand-made blocks)", () => {
  it("decodes a 4-colour block", () => {
    // c0 = pure white (0xFFFF), c1 = pure black (0x0000); c0 > c1 → 4-colour.
    const block = new Uint8Array([0xff, 0xff, 0x00, 0x00, 0b11100100, 0, 0, 0]);
    const out = decodeBc1(block, 4, 4);
    // Pixel 0 → index 0 (white), 1 → index 1 (black), 2 → index 2 (2/3 white),
    // 3 → index 3 (1/3 white).
    expect([out[0], out[1], out[2], out[3]]).toEqual([255, 255, 255, 255]);
    expect([out[4], out[5], out[6]]).toEqual([0, 0, 0]);
    expect(out[8]).toBe(170); // round(2*255/3)
    expect(out[12]).toBe(85); // round(255/3)
  });

  it("decodes the 3-colour punch-through mode with transparent index 3", () => {
    // c0 = 0x0000 < c1 = 0xFFFF → 3-colour mode.
    const block = new Uint8Array([0x00, 0x00, 0xff, 0xff, 0b11100100, 0, 0, 0]);
    const out = decodeBc1(block, 4, 4);
    expect(out[3]).toBe(255); // index 0 opaque
    expect(out[8 + 0]).toBe(128); // index 2 = midpoint of black and white
    expect(out[12 + 3]).toBe(0); // index 3 is transparent black
    expect(out[12 + 0]).toBe(0);
  });

  it("clips at non-multiple-of-four image edges", () => {
    const block = new Uint8Array([0xff, 0xff, 0x00, 0x00, 0, 0, 0, 0]);
    const out = new Uint8Array(3 * 2 * 4);
    decodeBc1Block(block, 0, out, 3 * 4, 0, 0, 3, 2, false);
    expect(out.length).toBe(24);
    expect(out[0]).toBe(255);
  });
});

describe("BC2 / BC3 alpha decoding", () => {
  it("decodes BC2 explicit 4-bit alpha", () => {
    const block = new Uint8Array(16);
    // Row 0: pixels 0..3 → alpha nibbles F, 0, 8, 1
    block[0] = 0x0f;
    block[1] = 0x18;
    block[8] = 0xff;
    block[9] = 0xff; // c0 = white
    const out = decodeBc2(block, 4, 4);
    expect(out[3]).toBe(0xff);
    expect(out[7]).toBe(0x00);
    expect(out[11]).toBe(0x88);
    expect(out[15]).toBe(0x11);
  });

  it("decodes the BC3 8-value alpha mode", () => {
    const block = new Uint8Array(8);
    block[0] = 255; // a0
    block[1] = 0; // a1  (a0 > a1 → 8-value mode)
    // 3-bit indices packed little-endian: pixel0 = 0, pixel1 = 1.
    block[2] = 0 | (1 << 3);
    const out = new Uint8Array(4 * 4 * 4);
    decodeBc3AlphaBlock(block, 0, out, 16, 0, 0, 4, 4);
    expect(out[3]).toBe(255); // index 0 → a0
    expect(out[7]).toBe(0); // index 1 → a1
  });

  it("decodes the BC3 6-value alpha mode with explicit 0 and 255", () => {
    const block = new Uint8Array(8);
    block[0] = 10; // a0
    block[1] = 200; // a1 (a0 <= a1 → 6-value mode)
    // pixel0 index 6 (→ 0), pixel1 index 7 (→ 255)
    block[2] = 6 | (7 << 3);
    const out = new Uint8Array(4 * 4 * 4);
    decodeBc3AlphaBlock(block, 0, out, 16, 0, 0, 4, 4);
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(255);
  });
});

describe("BC encoders", () => {
  it("encodes a flat block exactly", () => {
    const tile = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      tile[i * 4] = 255;
      tile[i * 4 + 1] = 0;
      tile[i * 4 + 2] = 0;
      tile[i * 4 + 3] = 255;
    }
    const enc = encodeBc1(tile, 4, 4);
    const dec = decodeBc1(enc, 4, 4);
    for (let i = 0; i < 16; i++) {
      expect(dec[i * 4]).toBe(255);
      expect(dec[i * 4 + 1]).toBe(0);
      expect(dec[i * 4 + 2]).toBe(0);
    }
  });

  it("reaches a sane PSNR on a gradient (BC1)", () => {
    const src = gradient(64, 64);
    const dec = decodeBc1(encodeBc1(src, 64, 64), 64, 64);
    expect(psnr(src, dec)).toBeGreaterThan(30);
  });

  it("reaches a sane PSNR on a gradient (BC3) and keeps alpha", () => {
    const src = gradient(64, 64);
    for (let i = 0; i < 64 * 64; i++) src[i * 4 + 3] = (i * 3) % 256;
    const dec = decodeBc3(encodeBc3(src, 64, 64), 64, 64);
    expect(psnr(src, dec)).toBeGreaterThan(28);
    // Alpha specifically should track well through the BC4 block.
    let alphaErr = 0;
    for (let i = 0; i < 64 * 64; i++) alphaErr += Math.abs(src[i * 4 + 3]! - dec[i * 4 + 3]!);
    expect(alphaErr / (64 * 64)).toBeLessThan(12);
  });

  it("encodes constant alpha exactly through BC3", () => {
    const src = gradient(16, 16);
    for (let i = 0; i < 256; i++) src[i * 4 + 3] = 128;
    const dec = decodeBc3(encodeBc3(src, 16, 16), 16, 16);
    for (let i = 0; i < 256; i++) expect(dec[i * 4 + 3]).toBe(128);
  });

  it("uses punch-through alpha when asked", () => {
    const src = gradient(4, 4);
    for (let i = 0; i < 16; i++) src[i * 4 + 3] = i < 8 ? 255 : 0;
    const dec = decodeBc1(encodeBc1(src, 4, 4, true), 4, 4);
    for (let i = 8; i < 16; i++) expect(dec[i * 4 + 3]).toBe(0);
    for (let i = 0; i < 8; i++) expect(dec[i * 4 + 3]).toBe(255);
  });
});

describe("surface sizing", () => {
  it("computes block-compressed sizes", () => {
    expect(surfaceSize("DXT1", 4, 4)).toBe(8);
    expect(surfaceSize("DXT5", 4, 4)).toBe(16);
    expect(surfaceSize("DXT1", 256, 256)).toBe((256 / 4) * (256 / 4) * 8);
    expect(surfaceSize("DXT1", 1, 1)).toBe(8); // padded up to one block
    expect(surfaceSize("A8R8G8B8", 8, 8)).toBe(8 * 8 * 4);
    expect(surfaceSize("L8", 8, 8)).toBe(64);
  });

  it("computes row pitch", () => {
    expect(rowPitch("DXT1", 256)).toBe(512);
    expect(rowPitch("DXT5", 256)).toBe(1024);
    expect(rowPitch("A8R8G8B8", 256)).toBe(1024);
  });

  it("computes full mip counts and chain sizes", () => {
    expect(fullMipCount(256, 256)).toBe(9);
    expect(fullMipCount(1, 1)).toBe(1);
    expect(fullMipCount(256, 64)).toBe(9);
    // 1 + 1/4 + 1/16 … of the base surface, with the block floor at 8 bytes.
    expect(mipChainSize("DXT1", 4, 4, 1)).toBe(8);
    expect(mipChainSize("DXT1", 8, 8, 2)).toBe(32 + 8);
  });
});

describe("mip generation", () => {
  it("halves dimensions and averages 2×2 boxes", () => {
    const src = new Uint8Array([
      0, 0, 0, 255, 100, 100, 100, 255, 0, 0, 0, 255, 100, 100, 100, 255, 100, 100, 100, 255, 0, 0,
      0, 255, 100, 100, 100, 255, 0, 0, 0, 255,
    ]);
    const out = downsampleRgba(src, 4, 2);
    expect(out.width).toBe(2);
    expect(out.height).toBe(1);
    expect(out.data[0]).toBe(50);
  });

  it("builds a full chain down to 1×1", () => {
    const chain = buildMipChain(gradient(32, 32), 32, 32);
    expect(chain.length).toBe(6);
    expect(chain.at(-1)!.width).toBe(1);
    expect(chain.at(-1)!.height).toBe(1);
  });

  it("caps the chain when asked", () => {
    expect(buildMipChain(gradient(32, 32), 32, 32, 3).length).toBe(3);
  });
});

describe("DDS files", () => {
  it("writes a header with the documented fields", () => {
    const dds = encodeDds(gradient(64, 64), 64, 64, { format: "DXT5", mips: true });
    expect(dds.subarray(0, 4).toString("latin1")).toBe("DDS ");
    expect(dds.readUInt32LE(4)).toBe(124); // dwSize
    expect(dds.readUInt32LE(12)).toBe(64); // height
    expect(dds.readUInt32LE(16)).toBe(64); // width
    expect(dds.readUInt32LE(28)).toBe(7); // mip count
    expect(dds.readUInt32LE(0x4c)).toBe(32); // pixelformat size
    expect(dds.subarray(0x54, 0x58).toString("latin1")).toBe("DXT5");
    expect(dds.length).toBe(DDS_HEADER_SIZE + mipChainSize("DXT5", 64, 64, 7));
  });

  it("round-trips DXT1 through decodeDds", () => {
    const src = gradient(32, 32);
    const file = encodeDds(src, 32, 32, { format: "DXT1", mips: true });
    const dec = decodeDds(file);
    expect(dec.width).toBe(32);
    expect(dec.height).toBe(32);
    expect(dec.format).toBe("DXT1");
    expect(dec.mips).toBe(6);
    expect(dec.levelSize(2)).toEqual({ width: 8, height: 8 });
    expect(dec.levelData(0).length).toBe(surfaceSize("DXT1", 32, 32));
    const rgba = dec.rgba(0)!;
    expect(psnr(src, rgba)).toBeGreaterThan(30);
  });

  it("round-trips uncompressed A8R8G8B8 exactly", () => {
    const src = gradient(8, 8);
    const file = encodeDds(src, 8, 8, { format: "A8R8G8B8" });
    const dec = decodeDds(file);
    expect(dec.format).toBe("A8R8G8B8");
    expect(dec.mips).toBe(1);
    expect(Buffer.from(dec.rgba(0)!).equals(Buffer.from(src))).toBe(true);
  });

  it("round-trips L8 and A8", () => {
    const src = gradient(8, 8);
    const l8 = decodeDds(encodeDds(src, 8, 8, { format: "L8" }));
    expect(l8.format).toBe("L8");
    expect(l8.rgba(0)!.length).toBe(8 * 8 * 4);
    const a8 = decodeDds(encodeDds(src, 8, 8, { format: "A8" }));
    expect(a8.format).toBe("A8");
    expect(a8.rgba(0)![3]).toBe(255);
  });

  it("writes a DX10 header for BC7 and reads the format back", () => {
    const blocks = Buffer.alloc(surfaceSize("BC7", 8, 8));
    const file = assembleDds("BC7", 8, 8, [blocks]);
    expect(file.subarray(0x54, 0x58).toString("latin1")).toBe("DX10");
    const dec = decodeDds(file);
    expect(dec.format).toBe("BC7");
    expect(dec.rgba(0)).toBeNull(); // no BC7 decoder
  });

  it("rejects malformed DDS buffers with typed errors", () => {
    expect(() => decodeDds(Buffer.alloc(10))).toThrow(RageFormatError);
    const bad = Buffer.alloc(200);
    bad.write("DDS ", 0, "latin1");
    bad.writeUInt32LE(99, 4);
    expect(() => decodeDds(bad)).toThrow(/header size is 99/);
  });

  it("rejects a truncated payload", () => {
    const file = encodeDds(gradient(16, 16), 16, 16, { format: "DXT1", mips: true });
    expect(() => decodeDds(file.subarray(0, DDS_HEADER_SIZE + 8))).toThrow(/payload/);
  });

  it("rejects an rgba buffer of the wrong size", () => {
    expect(() => encodeDds(new Uint8Array(10), 16, 16, { format: "DXT1" })).toThrow(RageFormatError);
  });
});
