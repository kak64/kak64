/**
 * RSC7 resource container: the wrapper around every GTA V `.ydr` / `.ytd` /
 * `.yft` / `.ydd` / `.ybn` file.
 *
 * ## File layout
 * ```text
 * 0x00  u32  magic         'RSC7'  (0x37435352 little-endian)
 * 0x04  i32  version       resource type version (see RESOURCE_VERSIONS)
 * 0x08  u32  systemFlags   page-count encoding of the system segment size
 * 0x0C  u32  graphicsFlags page-count encoding of the graphics segment size
 * 0x10  ...  raw DEFLATE stream; inflates to systemSize + graphicsSize bytes
 * ```
 * The inflated payload is the system segment immediately followed by the
 * graphics segment.
 *
 * ## Flag encoding (dexyfex's decoding of the RAGE page table)
 * The low 4 bits give a base page shift (`baseSize = 0x200 << ss`). The
 * remaining bits are counts of pages of nine size classes, and the segment size
 * is `baseSize * Σ(count × multiplier)`:
 *
 * | bits    | count range | multiplier |
 * | ------- | ----------- | ---------- |
 * | 4       | 0–1         | 256        |
 * | 5–6     | 0–3         | 128        |
 * | 7–10    | 0–15        | 64         |
 * | 11–16   | 0–63        | 32         |
 * | 17–23   | 0–127       | 16         |
 * | 24      | 0–1         | 8          |
 * | 25      | 0–1         | 4          |
 * | 26      | 0–1         | 2          |
 * | 27      | 0–1         | 1          |
 *
 * Bits 28–31 are not part of the size and are ignored here.
 *
 * Verified: the size formula reproduces the documented examples (flags
 * `0x08000004` → 0x2000, `0x01000004` → 0x10000) and round-trips through
 * {@link sizeToFlags} for a wide range of sizes in the unit tests.
 *
 * Derived from spec (not verified against the game): the assumption that the
 * decompressed segment image is addressed as one contiguous byte range, i.e.
 * that a resource pointer's offset is a plain offset into the segment. Our
 * writer therefore lays blocks out contiguously and does not attempt to keep
 * individual structures from straddling a page boundary.
 *
 * @packageDocumentation
 */

import { deflateRawSync, inflateRawSync, inflateSync } from "node:zlib";
import { RageFormatError } from "./errors.js";

/** `'RSC7'` as a little-endian u32. */
export const RSC7_MAGIC = 0x37435352;

/** Size of the RSC7 file header in bytes. */
export const RSC7_HEADER_SIZE = 16;

/**
 * Resource version numbers written into the RSC7 header per file type.
 * These are the values CodeWalker and the game use for GTA V (PC) resources.
 */
export const RESOURCE_VERSIONS = {
  /** Texture dictionary (`.ytd`). */
  ytd: 13,
  /** Drawable (`.ydr`). */
  ydr: 165,
  /** Drawable dictionary (`.ydd`). */
  ydd: 165,
  /** Fragment (`.yft`). */
  yft: 162,
  /** Static bounds (`.ybn`). */
  ybn: 43,
  /** Clip dictionary (`.ycd`). */
  ycd: 46,
  /** Particle/effect list (`.ypt`). */
  ypt: 68,
  /** Navmesh (`.ynv`). */
  ynv: 2,
  /** Map data (`.ymap`). */
  ymap: 2,
  /** Map types (`.ytyp`). */
  ytyp: 2,
} as const satisfies Record<string, number>;

/** Page size classes, largest first: `[multiplier, bitShift, bitMask]`. */
const PAGE_CLASSES: ReadonlyArray<readonly [multiplier: number, shift: number, mask: number]> = [
  [256, 4, 0x1],
  [128, 5, 0x3],
  [64, 7, 0xf],
  [32, 11, 0x3f],
  [16, 17, 0x7f],
  [8, 24, 0x1],
  [4, 25, 0x1],
  [2, 26, 0x1],
  [1, 27, 0x1],
];

/** Largest multiplier sum representable by the flag encoding. */
const MAX_PAGE_UNITS = PAGE_CLASSES.reduce((a, [m, , mask]) => a + m * mask, 0);

/** Decoded page table of one segment. */
export interface PageTable {
  /** `0x200 << baseShift` — size of the smallest page class. */
  baseSize: number;
  /** The `ss` value stored in bits 0–3. */
  baseShift: number;
  /** Counts per size class, largest class first (multipliers 256 … 1). */
  counts: number[];
  /** Total segment size in bytes. */
  size: number;
}

/**
 * Decode a segment flags word into its page table.
 *
 * @param flags - `systemFlags` or `graphicsFlags` from the RSC7 header.
 */
export function decodeFlags(flags: number): PageTable {
  const f = flags >>> 0;
  const baseShift = f & 0xf;
  const baseSize = 0x200 << baseShift;
  const counts: number[] = [];
  let units = 0;
  for (const [multiplier, shift, mask] of PAGE_CLASSES) {
    const c = (f >>> shift) & mask;
    counts.push(c);
    units += c * multiplier;
  }
  return { baseSize, baseShift, counts, size: baseSize * units };
}

/**
 * Size in bytes of the segment described by `flags`.
 *
 * @example
 * ```ts
 * flagsToSize(0x08000004); // 0x2000
 * flagsToSize(0x01000004); // 0x10000
 * ```
 */
export function flagsToSize(flags: number): number {
  return decodeFlags(flags).size;
}

/**
 * Encode a segment size into a flags word.
 *
 * Picks the smallest base page size (never below `minBaseSize`, default 0x2000
 * which is what the game uses for small resources) whose greedy page packing
 * can represent `size`, then fills page classes largest-first.
 *
 * @param size - Required segment size in bytes. `0` yields flags `0`.
 * @param options.minBaseSize - Lower bound for the base page size. Writers pass
 *   the size of their largest indivisible block so that block fits in one page.
 * @returns The flags word; `flagsToSize()` of it is `>= size`.
 * @throws {@link RageFormatError} when `size` is too large to encode.
 */
export function sizeToFlags(size: number, options: { minBaseSize?: number } = {}): number {
  if (size <= 0) return 0;
  const minBase = Math.max(0x200, options.minBaseSize ?? 0x2000);
  for (let baseShift = 0; baseShift <= 0xf; baseShift++) {
    const baseSize = 0x200 << baseShift;
    if (baseSize < minBase) continue;
    let units = Math.ceil(size / baseSize);
    if (units > MAX_PAGE_UNITS) continue;
    let flags = baseShift >>> 0;
    for (const [multiplier, shift, mask] of PAGE_CLASSES) {
      const take = Math.min(mask, Math.floor(units / multiplier));
      if (take > 0) {
        flags = (flags | (take << shift)) >>> 0;
        units -= take * multiplier;
      }
    }
    if (units === 0) return flags >>> 0;
  }
  throw new RageFormatError(`segment of ${size} bytes is too large to encode in RSC7 page flags`, {
    code: "SEGMENT_TOO_LARGE",
  });
}

/** Result of {@link parseRsc7}. */
export interface Rsc7File {
  /** Resource type version from the header. */
  version: number;
  /** Decoded system (CPU) segment size in bytes. */
  systemSize: number;
  /** Decoded graphics (GPU) segment size in bytes. */
  graphicsSize: number;
  /** Raw `systemFlags` word. */
  systemFlags: number;
  /** Raw `graphicsFlags` word. */
  graphicsFlags: number;
  /** Full inflated payload (system segment followed by graphics segment). */
  payload: Buffer;
  /** The system segment slice of {@link payload}. */
  systemData: Buffer;
  /** The graphics segment slice of {@link payload}. */
  graphicsData: Buffer;
  /** Always `true` for a successfully parsed RSC7 file. */
  isRsc7: boolean;
}

/**
 * Parse an RSC7 resource file: validate the header, inflate the payload and
 * split it into the system and graphics segments.
 *
 * Accepts both raw-DEFLATE payloads (what the game and CodeWalker write) and
 * zlib-wrapped payloads, which some third-party tools emit.
 *
 * @throws {@link RageFormatError} on a short buffer, wrong magic, a payload
 *   that fails to inflate, or a payload shorter than the declared segments.
 */
export function parseRsc7(buf: Buffer | Uint8Array): Rsc7File {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length < RSC7_HEADER_SIZE) {
    throw new RageFormatError(
      `buffer of ${b.length} bytes is shorter than the ${RSC7_HEADER_SIZE}-byte RSC7 header`,
      { code: "TRUNCATED", offset: 0 },
    );
  }
  const magic = b.readUInt32LE(0);
  if (magic !== RSC7_MAGIC) {
    throw new RageFormatError(
      `not an RSC7 resource: magic 0x${magic.toString(16).padStart(8, "0")} (expected 'RSC7')`,
      { code: "BAD_MAGIC", offset: 0 },
    );
  }
  const version = b.readInt32LE(4);
  const systemFlags = b.readUInt32LE(8);
  const graphicsFlags = b.readUInt32LE(12);
  const systemSize = flagsToSize(systemFlags);
  const graphicsSize = flagsToSize(graphicsFlags);

  const compressed = b.subarray(RSC7_HEADER_SIZE);
  let payload: Buffer;
  try {
    payload = inflateRawSync(compressed);
  } catch (rawErr) {
    try {
      payload = inflateSync(compressed);
    } catch {
      throw new RageFormatError("RSC7 payload could not be inflated (not a DEFLATE stream)", {
        code: "BAD_PAYLOAD",
        offset: RSC7_HEADER_SIZE,
        cause: rawErr,
      });
    }
  }

  if (payload.length < systemSize + graphicsSize) {
    throw new RageFormatError(
      `RSC7 payload is ${payload.length} bytes but the header declares ${systemSize} + ${graphicsSize} = ${systemSize + graphicsSize}`,
      { code: "TRUNCATED_PAYLOAD" },
    );
  }

  return {
    version,
    systemSize,
    graphicsSize,
    systemFlags,
    graphicsFlags,
    payload,
    systemData: payload.subarray(0, systemSize),
    graphicsData: payload.subarray(systemSize, systemSize + graphicsSize),
    isRsc7: true,
  };
}

/** True when `buf` starts with the RSC7 magic. */
export function isRsc7(buf: Buffer | Uint8Array): boolean {
  if (buf.length < 4) return false;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  return b.readUInt32LE(0) === RSC7_MAGIC;
}

/** Input to {@link writeRsc7}. */
export interface Rsc7Input {
  /** Resource type version, e.g. `RESOURCE_VERSIONS.ytd`. */
  version: number;
  /** System (CPU) segment bytes. Padded up to the encoded page size. */
  system: Buffer | Uint8Array;
  /** Graphics (GPU) segment bytes. Padded up to the encoded page size. */
  graphics?: Buffer | Uint8Array;
  /** Lower bound for the system segment's base page size. */
  systemMinBaseSize?: number;
  /** Lower bound for the graphics segment's base page size. */
  graphicsMinBaseSize?: number;
  /** zlib compression level for the payload (default 9). */
  level?: number;
}

/**
 * Serialize system + graphics segment bytes into an RSC7 file.
 *
 * The segments are zero-padded up to the page-aligned sizes the flag encoding
 * can express, concatenated, raw-deflated and written after a 16-byte header.
 *
 * @returns A complete `.ydr`/`.ytd`/… file buffer.
 */
export function writeRsc7(input: Rsc7Input): Buffer {
  const system = Buffer.from(input.system);
  const graphics = input.graphics ? Buffer.from(input.graphics) : Buffer.alloc(0);

  const systemFlags = sizeToFlags(system.length, { minBaseSize: input.systemMinBaseSize });
  const graphicsFlags = sizeToFlags(graphics.length, { minBaseSize: input.graphicsMinBaseSize });
  const systemSize = flagsToSize(systemFlags);
  const graphicsSize = flagsToSize(graphicsFlags);

  const payload = Buffer.alloc(systemSize + graphicsSize);
  system.copy(payload, 0);
  graphics.copy(payload, systemSize);

  const compressed = deflateRawSync(payload, { level: input.level ?? 9 });
  const out = Buffer.alloc(RSC7_HEADER_SIZE + compressed.length);
  out.writeUInt32LE(RSC7_MAGIC, 0);
  out.writeInt32LE(input.version, 4);
  out.writeUInt32LE(systemFlags, 8);
  out.writeUInt32LE(graphicsFlags, 12);
  compressed.copy(out, RSC7_HEADER_SIZE);
  return out;
}
