/**
 * BC1 / BC2 / BC3 (DXT1 / DXT3 / DXT5) block codecs.
 *
 * Decoders follow the S3TC / D3D block layouts exactly; encoders use a
 * bounding-box range fit refined by a few least-squares iterations, which is
 * slower than a single-pass fit but produces noticeably better endpoints.
 *
 * All RGBA buffers here are tightly packed, 4 bytes per pixel, row-major,
 * top-left origin.
 *
 * Verified: decoders are unit-tested against hand-assembled blocks with known
 * expected output; encoders are tested via encode→decode PSNR on gradients and
 * on exact-representable blocks.
 *
 * @packageDocumentation
 */

/** Expand a 5-bit channel to 8 bits. */
function x5(v: number): number {
  return ((v << 3) | (v >> 2)) & 0xff;
}
/** Expand a 6-bit channel to 8 bits. */
function x6(v: number): number {
  return ((v << 2) | (v >> 4)) & 0xff;
}

/** Pack an 8-bit RGB triple into RGB565. */
export function packRgb565(r: number, g: number, b: number): number {
  return (((r >> 3) & 0x1f) << 11) | (((g >> 2) & 0x3f) << 5) | ((b >> 3) & 0x1f);
}

/** Unpack RGB565 into 8-bit channels. */
export function unpackRgb565(c: number): [number, number, number] {
  return [x5((c >> 11) & 0x1f), x6((c >> 5) & 0x3f), x5(c & 0x1f)];
}

/**
 * Decode one BC1 colour block into a 4×4 RGBA tile.
 *
 * @param src - Buffer holding the block.
 * @param off - Offset of the 8-byte block.
 * @param out - Destination RGBA image.
 * @param outStride - Bytes per destination row.
 * @param x - Destination pixel column of the tile's top-left corner.
 * @param y - Destination pixel row of the tile's top-left corner.
 * @param width - Destination image width in pixels (for edge clipping).
 * @param height - Destination image height in pixels.
 * @param opaque - When true (BC2/BC3 colour blocks) the 3-colour mode is not
 *   used and alpha is left untouched.
 */
export function decodeBc1Block(
  src: Uint8Array,
  off: number,
  out: Uint8Array,
  outStride: number,
  x: number,
  y: number,
  width: number,
  height: number,
  opaque = false,
): void {
  const c0 = src[off]! | (src[off + 1]! << 8);
  const c1 = src[off + 2]! | (src[off + 3]! << 8);
  const bits = src[off + 4]! | (src[off + 5]! << 8) | (src[off + 6]! << 16) | (src[off + 7]! << 24);

  const [r0, g0, b0] = unpackRgb565(c0);
  const [r1, g1, b1] = unpackRgb565(c1);

  const r = [r0, r1, 0, 0];
  const g = [g0, g1, 0, 0];
  const b = [b0, b1, 0, 0];
  const a = [255, 255, 255, 255];

  if (c0 > c1 || opaque) {
    r[2] = (2 * r0 + r1) / 3;
    g[2] = (2 * g0 + g1) / 3;
    b[2] = (2 * b0 + b1) / 3;
    r[3] = (r0 + 2 * r1) / 3;
    g[3] = (g0 + 2 * g1) / 3;
    b[3] = (b0 + 2 * b1) / 3;
  } else {
    r[2] = (r0 + r1) / 2;
    g[2] = (g0 + g1) / 2;
    b[2] = (b0 + b1) / 2;
    r[3] = 0;
    g[3] = 0;
    b[3] = 0;
    a[3] = 0;
  }

  for (let py = 0; py < 4; py++) {
    const ty = y + py;
    if (ty >= height) break;
    for (let px = 0; px < 4; px++) {
      const tx = x + px;
      if (tx >= width) continue;
      const idx = (bits >>> (2 * (py * 4 + px))) & 0x3;
      const o = ty * outStride + tx * 4;
      out[o] = Math.round(r[idx]!);
      out[o + 1] = Math.round(g[idx]!);
      out[o + 2] = Math.round(b[idx]!);
      if (!opaque) out[o + 3] = a[idx]!;
    }
  }
}

/** Decode a BC2 (DXT3) explicit 4-bit alpha block into the alpha channel. */
export function decodeBc2AlphaBlock(
  src: Uint8Array,
  off: number,
  out: Uint8Array,
  outStride: number,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  for (let py = 0; py < 4; py++) {
    const ty = y + py;
    if (ty >= height) break;
    const row = src[off + py * 2]! | (src[off + py * 2 + 1]! << 8);
    for (let px = 0; px < 4; px++) {
      const tx = x + px;
      if (tx >= width) continue;
      const nib = (row >>> (px * 4)) & 0xf;
      out[ty * outStride + tx * 4 + 3] = (nib << 4) | nib;
    }
  }
}

/**
 * Decode a BC4-style 8-byte alpha block into the alpha channel (BC3 / DXT5).
 */
export function decodeBc3AlphaBlock(
  src: Uint8Array,
  off: number,
  out: Uint8Array,
  outStride: number,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const a0 = src[off]!;
  const a1 = src[off + 1]!;
  const alpha = new Array<number>(8);
  alpha[0] = a0;
  alpha[1] = a1;
  if (a0 > a1) {
    for (let i = 1; i <= 6; i++) alpha[i + 1] = ((7 - i) * a0 + i * a1) / 7;
  } else {
    for (let i = 1; i <= 4; i++) alpha[i + 1] = ((5 - i) * a0 + i * a1) / 5;
    alpha[6] = 0;
    alpha[7] = 255;
  }
  // 48 bits of 3-bit indices, little-endian across the 6 index bytes.
  let lo = 0n;
  for (let i = 0; i < 6; i++) lo |= BigInt(src[off + 2 + i]!) << BigInt(8 * i);
  for (let py = 0; py < 4; py++) {
    const ty = y + py;
    if (ty >= height) break;
    for (let px = 0; px < 4; px++) {
      const tx = x + px;
      if (tx >= width) continue;
      const shift = BigInt(3 * (py * 4 + px));
      const idx = Number((lo >> shift) & 0x7n);
      out[ty * outStride + tx * 4 + 3] = Math.round(alpha[idx]!);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Encoding                                  */
/* -------------------------------------------------------------------------- */

/** Extract a 4×4 RGBA tile, clamping reads at the image edges. */
function gatherTile(
  src: Uint8Array,
  stride: number,
  x: number,
  y: number,
  width: number,
  height: number,
): Uint8Array {
  const tile = new Uint8Array(64);
  for (let py = 0; py < 4; py++) {
    const sy = Math.min(y + py, height - 1);
    for (let px = 0; px < 4; px++) {
      const sx = Math.min(x + px, width - 1);
      const s = sy * stride + sx * 4;
      const d = (py * 4 + px) * 4;
      tile[d] = src[s]!;
      tile[d + 1] = src[s + 1]!;
      tile[d + 2] = src[s + 2]!;
      tile[d + 3] = src[s + 3]!;
    }
  }
  return tile;
}

/** Squared distance between two RGB triples. */
function dist2(ar: number, ag: number, ab: number, br: number, bg: number, bb: number): number {
  const dr = ar - br;
  const dg = ag - bg;
  const db = ab - bb;
  return dr * dr + dg * dg + db * db;
}

interface Endpoints {
  c0: number;
  c1: number;
}

/**
 * Fit two RGB565 endpoints to a tile.
 *
 * Starts from the tile's RGB bounding box (a range fit) and then runs a few
 * rounds of "assign indices, least-squares refit endpoints", which recovers
 * most of the quality of a full principal-axis fit at trivial cost.
 *
 * @param tile - 4×4 RGBA tile (64 bytes).
 * @param mask - Per-pixel inclusion flags (used to skip transparent texels).
 * @param fourColour - Fit 4 (true) or 3 (false) palette entries.
 */
function fitEndpoints(tile: Uint8Array, mask: boolean[], fourColour: boolean): Endpoints {
  let minR = 255,
    minG = 255,
    minB = 255,
    maxR = 0,
    maxG = 0,
    maxB = 0,
    n = 0;
  for (let i = 0; i < 16; i++) {
    if (!mask[i]) continue;
    const r = tile[i * 4]!,
      g = tile[i * 4 + 1]!,
      b = tile[i * 4 + 2]!;
    minR = Math.min(minR, r);
    minG = Math.min(minG, g);
    minB = Math.min(minB, b);
    maxR = Math.max(maxR, r);
    maxG = Math.max(maxG, g);
    maxB = Math.max(maxB, b);
    n++;
  }
  if (n === 0) return { c0: 0, c1: 0 };

  let e0 = [maxR, maxG, maxB];
  let e1 = [minR, minG, minB];

  const steps = fourColour ? 3 : 2;
  for (let iter = 0; iter < 8; iter++) {
    // Assign each pixel to the nearest palette entry along the current line.
    const w: number[] = [];
    for (let i = 0; i < 16; i++) {
      if (!mask[i]) {
        w.push(-1);
        continue;
      }
      const r = tile[i * 4]!,
        g = tile[i * 4 + 1]!,
        b = tile[i * 4 + 2]!;
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const pr = e0[0]! * (1 - t) + e1[0]! * t;
        const pg = e0[1]! * (1 - t) + e1[1]! * t;
        const pb = e0[2]! * (1 - t) + e1[2]! * t;
        const d = dist2(r, g, b, pr, pg, pb);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      w.push(best / steps);
    }
    // Least squares: minimise Σ‖p_i − ((1−t_i)·e0 + t_i·e1)‖².
    let a00 = 0,
      a01 = 0,
      a11 = 0;
    const b0 = [0, 0, 0];
    const b1 = [0, 0, 0];
    for (let i = 0; i < 16; i++) {
      const t = w[i]!;
      if (t < 0) continue;
      const u = 1 - t;
      a00 += u * u;
      a01 += u * t;
      a11 += t * t;
      for (let c = 0; c < 3; c++) {
        b0[c] = b0[c]! + u * tile[i * 4 + c]!;
        b1[c] = b1[c]! + t * tile[i * 4 + c]!;
      }
    }
    const det = a00 * a11 - a01 * a01;
    if (Math.abs(det) < 1e-6) break;
    const n0 = [0, 0, 0];
    const n1 = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      n0[c] = Math.max(0, Math.min(255, (a11 * b0[c]! - a01 * b1[c]!) / det));
      n1[c] = Math.max(0, Math.min(255, (a00 * b1[c]! - a01 * b0[c]!) / det));
    }
    const moved =
      dist2(n0[0]!, n0[1]!, n0[2]!, e0[0]!, e0[1]!, e0[2]!) +
      dist2(n1[0]!, n1[1]!, n1[2]!, e1[0]!, e1[1]!, e1[2]!);
    e0 = n0;
    e1 = n1;
    if (moved < 0.01) break;
  }

  return {
    c0: packRgb565(Math.round(e0[0]!), Math.round(e0[1]!), Math.round(e0[2]!)),
    c1: packRgb565(Math.round(e1[0]!), Math.round(e1[1]!), Math.round(e1[2]!)),
  };
}

/** Build the 4-entry decoded palette used by a BC1 block. */
function palette(c0: number, c1: number, fourColour: boolean): number[][] {
  const [r0, g0, b0] = unpackRgb565(c0);
  const [r1, g1, b1] = unpackRgb565(c1);
  if (fourColour) {
    return [
      [r0, g0, b0],
      [r1, g1, b1],
      [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3],
      [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3],
    ];
  }
  return [
    [r0, g0, b0],
    [r1, g1, b1],
    [(r0 + r1) / 2, (g0 + g1) / 2, (b0 + b1) / 2],
    [0, 0, 0],
  ];
}

/**
 * Encode one 4×4 tile as a BC1 colour block.
 *
 * @param tile - 64-byte RGBA tile.
 * @param allowAlpha - When true, texels with alpha &lt; 128 are encoded with the
 *   3-colour punch-through mode (index 3).
 * @param dst - Destination buffer.
 * @param off - Offset of the 8-byte block.
 */
export function encodeBc1Block(
  tile: Uint8Array,
  allowAlpha: boolean,
  dst: Uint8Array,
  off: number,
): void {
  const transparent: boolean[] = [];
  let anyTransparent = false;
  for (let i = 0; i < 16; i++) {
    const t = allowAlpha && tile[i * 4 + 3]! < 128;
    transparent.push(t);
    if (t) anyTransparent = true;
  }
  const fourColour = !anyTransparent;
  const opaqueMask = transparent.map((t) => !t);

  let { c0, c1 } = fitEndpoints(tile, opaqueMask, fourColour);
  // Mode is selected by the ordering of the two endpoints.
  if (fourColour) {
    if (c0 < c1) [c0, c1] = [c1, c0];
    if (c0 === c1 && c0 > 0) c1 = c0 - 1; // keep c0 > c1 so the 4-colour mode holds
  } else if (c0 > c1) {
    [c0, c1] = [c1, c0];
  }

  const pal = palette(c0, c1, fourColour);
  let bits = 0;
  for (let i = 0; i < 16; i++) {
    let idx: number;
    if (transparent[i]) {
      idx = 3;
    } else {
      const r = tile[i * 4]!,
        g = tile[i * 4 + 1]!,
        b = tile[i * 4 + 2]!;
      const limit = fourColour ? 4 : 3;
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < limit; k++) {
        const d = dist2(r, g, b, pal[k]![0]!, pal[k]![1]!, pal[k]![2]!);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      idx = best;
    }
    bits |= idx << (2 * i);
  }
  dst[off] = c0 & 0xff;
  dst[off + 1] = (c0 >> 8) & 0xff;
  dst[off + 2] = c1 & 0xff;
  dst[off + 3] = (c1 >> 8) & 0xff;
  dst[off + 4] = bits & 0xff;
  dst[off + 5] = (bits >>> 8) & 0xff;
  dst[off + 6] = (bits >>> 16) & 0xff;
  dst[off + 7] = (bits >>> 24) & 0xff;
}

/**
 * Encode one 4×4 tile's alpha as a BC4 / DXT5 alpha block.
 *
 * Tries both the 8-value (a0 &gt; a1) and 6-value (a0 &lt;= a1, with explicit
 * 0 and 255) modes and keeps the one with lower squared error.
 */
export function encodeBc3AlphaBlock(tile: Uint8Array, dst: Uint8Array, off: number): void {
  let min = 255;
  let max = 0;
  for (let i = 0; i < 16; i++) {
    const a = tile[i * 4 + 3]!;
    if (a < min) min = a;
    if (a > max) max = a;
  }

  const evaluate = (a0: number, a1: number): { error: number; indices: number[] } => {
    const lut: number[] = [a0, a1];
    if (a0 > a1) {
      for (let i = 1; i <= 6; i++) lut.push(((7 - i) * a0 + i * a1) / 7);
    } else {
      for (let i = 1; i <= 4; i++) lut.push(((5 - i) * a0 + i * a1) / 5);
      lut.push(0, 255);
    }
    let error = 0;
    const indices: number[] = [];
    for (let i = 0; i < 16; i++) {
      const a = tile[i * 4 + 3]!;
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < 8; k++) {
        const d = (a - lut[k]!) ** 2;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      indices.push(best);
      error += bestD;
    }
    return { error, indices };
  };

  // 8-value mode requires a0 > a1; 6-value mode requires a0 <= a1.
  const eightA0 = max;
  const eightA1 = max > min ? min : Math.max(0, max - 1);
  const eight = evaluate(eightA0, eightA1);
  const six = evaluate(min, max);
  const useEight = eight.error <= six.error;
  const a0 = useEight ? eightA0 : min;
  const a1 = useEight ? eightA1 : max;
  const chosen = useEight ? eight : six;

  dst[off] = a0 & 0xff;
  dst[off + 1] = a1 & 0xff;
  let bits = 0n;
  for (let i = 0; i < 16; i++) bits |= BigInt(chosen.indices[i]!) << BigInt(3 * i);
  for (let i = 0; i < 6; i++) dst[off + 2 + i] = Number((bits >> BigInt(8 * i)) & 0xffn);
}

/** Encode a whole RGBA image as BC1 (DXT1). */
export function encodeBc1(
  rgba: Uint8Array,
  width: number,
  height: number,
  allowAlpha = false,
): Uint8Array {
  const bw = Math.max(1, Math.ceil(width / 4));
  const bh = Math.max(1, Math.ceil(height / 4));
  const out = new Uint8Array(bw * bh * 8);
  const stride = width * 4;
  let o = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const tile = gatherTile(rgba, stride, bx * 4, by * 4, width, height);
      encodeBc1Block(tile, allowAlpha, out, o);
      o += 8;
    }
  }
  return out;
}

/** Encode a whole RGBA image as BC3 (DXT5). */
export function encodeBc3(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const bw = Math.max(1, Math.ceil(width / 4));
  const bh = Math.max(1, Math.ceil(height / 4));
  const out = new Uint8Array(bw * bh * 16);
  const stride = width * 4;
  let o = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const tile = gatherTile(rgba, stride, bx * 4, by * 4, width, height);
      encodeBc3AlphaBlock(tile, out, o);
      encodeBc1Block(tile, false, out, o + 8);
      o += 16;
    }
  }
  return out;
}

/** Decode a whole BC1 surface to RGBA. */
export function decodeBc1(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  out.fill(255);
  const bw = Math.max(1, Math.ceil(width / 4));
  const bh = Math.max(1, Math.ceil(height / 4));
  let o = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      decodeBc1Block(src, o, out, width * 4, bx * 4, by * 4, width, height, false);
      o += 8;
    }
  }
  return out;
}

/** Decode a whole BC2 (DXT3) surface to RGBA. */
export function decodeBc2(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  out.fill(255);
  const bw = Math.max(1, Math.ceil(width / 4));
  const bh = Math.max(1, Math.ceil(height / 4));
  let o = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      decodeBc2AlphaBlock(src, o, out, width * 4, bx * 4, by * 4, width, height);
      decodeBc1Block(src, o + 8, out, width * 4, bx * 4, by * 4, width, height, true);
      o += 16;
    }
  }
  return out;
}

/** Decode a whole BC3 (DXT5) surface to RGBA. */
export function decodeBc3(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  out.fill(255);
  const bw = Math.max(1, Math.ceil(width / 4));
  const bh = Math.max(1, Math.ceil(height / 4));
  let o = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      decodeBc3AlphaBlock(src, o, out, width * 4, bx * 4, by * 4, width, height);
      decodeBc1Block(src, o + 8, out, width * 4, bx * 4, by * 4, width, height, true);
      o += 16;
    }
  }
  return out;
}
