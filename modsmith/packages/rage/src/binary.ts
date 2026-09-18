/**
 * Little-endian binary reading and writing with RAGE resource pointer
 * semantics.
 *
 * ## Resource pointers
 * Inside a decompressed resource every pointer is a 32-bit word whose top
 * nibble selects the segment and whose low 28 bits are a byte offset into that
 * segment:
 *
 * - `0x5_______` — system (CPU) segment
 * - `0x6_______` — graphics (GPU) segment
 * - `0x00000000` — null
 *
 * Verified: this encoding round-trips through {@link ResourceBuilder} and
 * {@link ResourceReader} in the unit tests, and our own `.ytd` writer produces
 * files our `.ytd` reader walks purely by following these pointers.
 *
 * @packageDocumentation
 */

import { RageFormatError } from "./errors.js";

/** Which of the two resource segments an address lives in. */
export type Segment = "system" | "graphics";

/** Pointer tag for the system (CPU) segment. */
export const SYSTEM_BASE = 0x50000000;
/** Pointer tag for the graphics (GPU) segment. */
export const GRAPHICS_BASE = 0x60000000;
/** Mask selecting the offset part of a resource pointer. */
export const POINTER_OFFSET_MASK = 0x0fffffff;

/** Build a resource pointer from a segment and offset. */
export function makePointer(segment: Segment, offset: number): number {
  if (offset < 0 || offset > POINTER_OFFSET_MASK) {
    throw new RageFormatError(`offset 0x${offset.toString(16)} does not fit in a resource pointer`, {
      code: "POINTER_RANGE",
    });
  }
  return ((segment === "system" ? SYSTEM_BASE : GRAPHICS_BASE) | offset) >>> 0;
}

/** Decoded resource pointer. */
export interface DecodedPointer {
  segment: Segment;
  offset: number;
}

/**
 * Split a resource pointer into segment and offset.
 *
 * @returns `null` for a null pointer.
 * @throws {@link RageFormatError} when the segment nibble is neither 5 nor 6.
 */
export function decodePointer(ptr: number): DecodedPointer | null {
  const p = ptr >>> 0;
  if (p === 0) return null;
  const tag = p >>> 28;
  const offset = p & POINTER_OFFSET_MASK;
  if (tag === 0x5) return { segment: "system", offset };
  if (tag === 0x6) return { segment: "graphics", offset };
  throw new RageFormatError(
    `pointer 0x${p.toString(16).padStart(8, "0")} has unknown segment tag ${tag} (expected 5=system or 6=graphics)`,
    { code: "BAD_POINTER" },
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Reading                                  */
/* -------------------------------------------------------------------------- */

/**
 * Random-access reader over a decompressed resource's two segments.
 *
 * All reads are bounds-checked and throw {@link RageFormatError} rather than
 * returning undefined data.
 */
export class ResourceReader {
  readonly system: Buffer;
  readonly graphics: Buffer;

  constructor(system: Buffer | Uint8Array, graphics: Buffer | Uint8Array = Buffer.alloc(0)) {
    this.system = Buffer.isBuffer(system) ? system : Buffer.from(system);
    this.graphics = Buffer.isBuffer(graphics) ? graphics : Buffer.from(graphics);
  }

  /** The buffer backing a segment. */
  segmentBuffer(segment: Segment): Buffer {
    return segment === "system" ? this.system : this.graphics;
  }

  private check(segment: Segment, offset: number, length: number): Buffer {
    const buf = this.segmentBuffer(segment);
    if (offset < 0 || offset + length > buf.length) {
      throw new RageFormatError(
        `read of ${length} bytes at ${segment}+0x${offset.toString(16)} is out of bounds (segment is ${buf.length} bytes)`,
        { code: "OUT_OF_BOUNDS", offset },
      );
    }
    return buf;
  }

  /** Read `length` bytes as a subarray view (no copy). */
  bytes(segment: Segment, offset: number, length: number): Buffer {
    return this.check(segment, offset, length).subarray(offset, offset + length);
  }

  u8(segment: Segment, offset: number): number {
    return this.check(segment, offset, 1).readUInt8(offset);
  }
  i8(segment: Segment, offset: number): number {
    return this.check(segment, offset, 1).readInt8(offset);
  }
  u16(segment: Segment, offset: number): number {
    return this.check(segment, offset, 2).readUInt16LE(offset);
  }
  i16(segment: Segment, offset: number): number {
    return this.check(segment, offset, 2).readInt16LE(offset);
  }
  u32(segment: Segment, offset: number): number {
    return this.check(segment, offset, 4).readUInt32LE(offset);
  }
  i32(segment: Segment, offset: number): number {
    return this.check(segment, offset, 4).readInt32LE(offset);
  }
  f32(segment: Segment, offset: number): number {
    return this.check(segment, offset, 4).readFloatLE(offset);
  }
  u64(segment: Segment, offset: number): bigint {
    return this.check(segment, offset, 8).readBigUInt64LE(offset);
  }

  /** Read a resource pointer word. */
  pointer(segment: Segment, offset: number): DecodedPointer | null {
    return decodePointer(this.u32(segment, offset));
  }

  /** Read a 3-component float vector. */
  vec3(segment: Segment, offset: number): [number, number, number] {
    return [this.f32(segment, offset), this.f32(segment, offset + 4), this.f32(segment, offset + 8)];
  }

  /** Read a 4-component float vector. */
  vec4(segment: Segment, offset: number): [number, number, number, number] {
    return [
      this.f32(segment, offset),
      this.f32(segment, offset + 4),
      this.f32(segment, offset + 8),
      this.f32(segment, offset + 12),
    ];
  }

  /**
   * Read a NUL-terminated ASCII string.
   *
   * @param maxLength - Safety bound; a string longer than this throws.
   */
  cstring(segment: Segment, offset: number, maxLength = 512): string {
    const buf = this.segmentBuffer(segment);
    if (offset < 0 || offset >= buf.length) {
      throw new RageFormatError(
        `string offset ${segment}+0x${offset.toString(16)} is out of bounds`,
        { code: "OUT_OF_BOUNDS", offset },
      );
    }
    const limit = Math.min(buf.length, offset + maxLength);
    let end = offset;
    while (end < limit && buf[end] !== 0) end++;
    if (end === limit && end < buf.length && buf[end] !== 0) {
      throw new RageFormatError(
        `unterminated string at ${segment}+0x${offset.toString(16)} (over ${maxLength} bytes)`,
        { code: "BAD_STRING", offset },
      );
    }
    return buf.subarray(offset, end).toString("latin1");
  }

  /** Follow a pointer and read the NUL-terminated string it points at. */
  stringAt(ptr: DecodedPointer | null, maxLength = 512): string | null {
    if (!ptr) return null;
    return this.cstring(ptr.segment, ptr.offset, maxLength);
  }

  /**
   * Read a `pgArray`-style pointer list: `count` pointer words starting at
   * `ptr`, each decoded.
   */
  pointerList(ptr: DecodedPointer | null, count: number): Array<DecodedPointer | null> {
    if (!ptr || count <= 0) return [];
    const out: Array<DecodedPointer | null> = [];
    for (let i = 0; i < count; i++) out.push(this.pointer(ptr.segment, ptr.offset + i * 4));
    return out;
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Writing                                  */
/* -------------------------------------------------------------------------- */

interface Fixup {
  /** Byte offset inside the owning block where the pointer word lives. */
  at: number;
  target: Block;
  targetOffset: number;
}

/**
 * A single allocated structure in a resource segment.
 *
 * Blocks are written sequentially through the `write*` helpers; pointers are
 * recorded as fixups and patched once every block has been given an offset by
 * {@link ResourceBuilder.build}.
 */
export class Block {
  readonly segment: Segment;
  readonly align: number;
  /** Assigned during {@link ResourceBuilder.build}; `-1` before that. */
  offset = -1;
  /** Debug label, surfaced in error messages. */
  readonly label: string;

  private buf: Buffer;
  private len = 0;
  private readonly fixed: boolean;
  private readonly fixups: Fixup[] = [];

  constructor(segment: Segment, options: { size?: number; align?: number; label?: string } = {}) {
    this.segment = segment;
    this.align = options.align ?? 16;
    this.label = options.label ?? "block";
    this.fixed = options.size !== undefined;
    this.buf = Buffer.alloc(options.size ?? 64);
    if (this.fixed) this.len = options.size as number;
  }

  /** Current length of the block in bytes. */
  get length(): number {
    return this.len;
  }

  /** Current write cursor position. */
  private pos = 0;

  /** Byte offset the next `write*` call will target. */
  get position(): number {
    return this.pos;
  }

  /** Move the write cursor. */
  seek(position: number): this {
    this.ensure(position, 0);
    this.pos = position;
    return this;
  }

  private ensure(at: number, size: number): void {
    const needed = at + size;
    if (needed > this.buf.length) {
      if (this.fixed) {
        throw new RageFormatError(
          `write of ${size} bytes at 0x${at.toString(16)} overflows fixed block "${this.label}" (${this.buf.length} bytes)`,
          { code: "BLOCK_OVERFLOW" },
        );
      }
      let cap = this.buf.length || 64;
      while (cap < needed) cap *= 2;
      const next = Buffer.alloc(cap);
      this.buf.copy(next, 0, 0, this.len);
      this.buf = next;
    }
    if (needed > this.len) this.len = needed;
  }

  private put(size: number, fn: (buf: Buffer, at: number) => void): this {
    this.ensure(this.pos, size);
    fn(this.buf, this.pos);
    this.pos += size;
    return this;
  }

  u8(v: number): this {
    return this.put(1, (b, a) => b.writeUInt8(v & 0xff, a));
  }
  i8(v: number): this {
    return this.put(1, (b, a) => b.writeInt8(v, a));
  }
  u16(v: number): this {
    return this.put(2, (b, a) => b.writeUInt16LE(v & 0xffff, a));
  }
  i16(v: number): this {
    return this.put(2, (b, a) => b.writeInt16LE(v, a));
  }
  u32(v: number): this {
    return this.put(4, (b, a) => b.writeUInt32LE(v >>> 0, a));
  }
  i32(v: number): this {
    return this.put(4, (b, a) => b.writeInt32LE(v | 0, a));
  }
  f32(v: number): this {
    return this.put(4, (b, a) => b.writeFloatLE(v, a));
  }
  u64(v: bigint | number): this {
    return this.put(8, (b, a) => b.writeBigUInt64LE(BigInt(v), a));
  }
  bytes(data: Buffer | Uint8Array): this {
    const src = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return this.put(src.length, (b, a) => void src.copy(b, a));
  }
  /** Write `count` zero bytes. */
  zeros(count: number): this {
    return this.put(count, (b, a) => void b.fill(0, a, a + count));
  }
  vec3(v: readonly [number, number, number] | ArrayLike<number>): this {
    return this.f32(v[0] as number).f32(v[1] as number).f32(v[2] as number);
  }
  vec4(v: ArrayLike<number>): this {
    return this.f32(v[0] as number)
      .f32(v[1] as number)
      .f32(v[2] as number)
      .f32(v[3] as number);
  }

  /**
   * Write a resource pointer to `target` (+ `targetOffset`), or a null pointer
   * when `target` is null/undefined.
   */
  pointer(target: Block | null | undefined, targetOffset = 0): this {
    if (!target) return this.u32(0);
    this.ensure(this.pos, 4);
    this.fixups.push({ at: this.pos, target, targetOffset });
    this.buf.writeUInt32LE(0, this.pos);
    this.pos += 4;
    return this;
  }

  /** Pad with zeros until the cursor is a multiple of `alignment`. */
  alignTo(alignment: number): this {
    const rem = this.pos % alignment;
    if (rem !== 0) this.zeros(alignment - rem);
    return this;
  }

  /** @internal Materialize the block's bytes with pointers patched. */
  finalize(): Buffer {
    const out = Buffer.alloc(this.len);
    this.buf.copy(out, 0, 0, this.len);
    for (const fx of this.fixups) {
      if (fx.target.offset < 0) {
        throw new RageFormatError(
          `block "${fx.target.label}" referenced from "${this.label}" was never added to the builder`,
          { code: "UNRESOLVED_POINTER" },
        );
      }
      out.writeUInt32LE(makePointer(fx.target.segment, fx.target.offset + fx.targetOffset), fx.at);
    }
    return out;
  }
}

/** Result of {@link ResourceBuilder.build}. */
export interface BuiltResource {
  system: Buffer;
  graphics: Buffer;
  /** Size of the largest single system block (a page must be able to hold it). */
  largestSystemBlock: number;
  /** Size of the largest single graphics block. */
  largestGraphicsBlock: number;
}

/**
 * Lays structures out into the two resource segments and resolves pointers
 * after layout.
 *
 * Blocks are placed in creation order, each aligned to its own alignment
 * (16 bytes by default, which is what RAGE's page allocator uses for
 * structures). The resulting segment images are contiguous byte ranges, so a
 * pointer's offset is simply the block's position in its segment.
 */
export class ResourceBuilder {
  private readonly blocks: Block[] = [];
  private readonly strings = new Map<string, Block>();

  /**
   * Allocate a block.
   *
   * @param segment - Which segment the structure lives in.
   * @param options.size - Fixed size; omit for a growable block.
   * @param options.align - Alignment, default 16.
   */
  alloc(segment: Segment, options: { size?: number; align?: number; label?: string } = {}): Block {
    const b = new Block(segment, options);
    this.blocks.push(b);
    return b;
  }

  /** Allocate a system-segment block (the common case). */
  system(options: { size?: number; align?: number; label?: string } = {}): Block {
    return this.alloc("system", options);
  }

  /** Allocate a graphics-segment block (texture / vertex / index data). */
  graphics(options: { size?: number; align?: number; label?: string } = {}): Block {
    return this.alloc("graphics", options);
  }

  /**
   * Allocate (or reuse) a NUL-terminated ASCII string block in the system
   * segment. Identical strings share one block.
   */
  string(value: string): Block {
    const existing = this.strings.get(value);
    if (existing) return existing;
    const b = this.alloc("system", { align: 4, label: `str:${value}` });
    b.bytes(Buffer.from(value, "latin1")).u8(0);
    this.strings.set(value, b);
    return b;
  }

  /** Number of blocks allocated so far. */
  get blockCount(): number {
    return this.blocks.length;
  }

  /**
   * Assign offsets to every block and produce the two segment images with all
   * pointers resolved.
   */
  build(): BuiltResource {
    const cursors: Record<Segment, number> = { system: 0, graphics: 0 };
    let largestSystemBlock = 0;
    let largestGraphicsBlock = 0;
    for (const b of this.blocks) {
      const align = b.align;
      const rem = cursors[b.segment] % align;
      if (rem !== 0) cursors[b.segment] += align - rem;
      b.offset = cursors[b.segment];
      cursors[b.segment] += b.length;
      if (b.segment === "system") largestSystemBlock = Math.max(largestSystemBlock, b.length);
      else largestGraphicsBlock = Math.max(largestGraphicsBlock, b.length);
    }
    // Round each segment up to 16 bytes so segment images stay aligned.
    const pad = (n: number) => (n % 16 === 0 ? n : n + (16 - (n % 16)));
    const system = Buffer.alloc(pad(cursors.system));
    const graphics = Buffer.alloc(pad(cursors.graphics));
    for (const b of this.blocks) {
      const dest = b.segment === "system" ? system : graphics;
      b.finalize().copy(dest, b.offset);
    }
    return { system, graphics, largestSystemBlock, largestGraphicsBlock };
  }
}
