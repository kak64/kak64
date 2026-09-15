/**
 * Texture dictionaries (`.ytd`).
 *
 * ## Structures (GTA V PC, 64-bit resources)
 * A `.ytd` resource's root object at system offset 0 is a `pgDictionary` of
 * `grcTexture`:
 *
 * ```text
 * TextureDictionary                       size 0x40
 *   0x00 u32  VFT                         (patched by the game's loader)
 *   0x04 u32  unknown                     always 1
 *   0x08 u64  pagesInfoPointer            runtime only, 0 in files
 *   0x10 u32  unknown[4]                  0
 *   0x20 u64  ptr → u32 nameHashes[count]
 *   0x28 u16  count, u16 capacity, u32 pad
 *   0x30 u64  ptr → u64 texturePointers[count]
 *   0x38 u16  count, u16 capacity, u32 pad
 *
 * TextureBase                             size 0x30
 *   0x00 u32  VFT
 *   0x04 u32  unknown = 1
 *   0x08 u64  unknown = 0
 *   0x10 u64  unknown = 0
 *   0x18 u32  unknown = 1                 (reference count)
 *   0x1C u32  unknown = 0
 *   0x20 u64  ptr → NUL-terminated name
 *   0x28 u32  unknown, 0x2C u32 unknown
 *
 * Texture : TextureBase                   size 0x90
 *   0x30 u32  unknown[6]
 *   0x48 u16  width, 0x4A u16 height, 0x4C u16 depth, 0x4E u16 stride
 *   0x50 u32  format                      D3DFORMAT / FourCC code
 *   0x54 u8   unknown, 0x55 u8 mipLevels, 0x56 u16 unknown
 *   0x58 f32  unknown, 0x5C u32 unknown
 *   0x60 u32  unknown, 0x64 u32 unknown
 *   0x68 u64  ptr → mip chain in the graphics segment
 *   0x70 …    0x20 bytes of runtime fields, 0 in files
 * ```
 *
 * The dictionary's `nameHashes` array must be sorted ascending — the game looks
 * textures up by binary search — and the `texturePointers` array is in the same
 * order.
 *
 * Verified: `writeYtd → readYtd` round-trips names, dimensions, format, mip
 * count and every mip's bytes; the reader walks the file purely by following
 * pointers, so the offsets above are exercised end to end.
 *
 * Derived from spec (not verified against the game): the VFT values and the
 * `unknown` fields. The game's resource loader patches VFTs on load; this
 * writer emits 0 unless a caller supplies values (for example when rewriting a
 * dictionary read from a real file, where {@link readYtd} preserves them).
 *
 * @packageDocumentation
 */

import { ResourceBuilder, ResourceReader, type Block, type DecodedPointer } from "./binary.js";
import {
  assembleDds,
  decodeDds,
  mipChainSize,
  rowPitch,
  surfaceSize,
  surfaceToRgba,
  type TextureFormat,
} from "./dds.js";
import { RageFormatError } from "./errors.js";
import { joaat } from "./hash.js";
import { parseRsc7, RESOURCE_VERSIONS, writeRsc7 } from "./rsc7.js";

/** Size of the `TextureDictionary` structure. */
export const TEXTURE_DICTIONARY_SIZE = 0x40;
/** Size of the `grcTexture` structure. */
export const TEXTURE_SIZE = 0x90;

/** D3DFORMAT / FourCC codes GTA V stores in `Texture.format`. */
export const D3DFORMAT = {
  A8R8G8B8: 21,
  A1R5G5B5: 25,
  A8: 28,
  A8B8G8R8: 32,
  L8: 50,
  DXT1: 0x31545844,
  DXT3: 0x33545844,
  DXT5: 0x35545844,
  ATI1: 0x31495441,
  ATI2: 0x32495441,
  BC7: 0x20374342,
} as const;

/** Map a `Texture.format` code to a {@link TextureFormat} name. */
export function formatFromD3d(code: number): TextureFormat {
  switch (code >>> 0) {
    case D3DFORMAT.A8R8G8B8:
    case D3DFORMAT.A8B8G8R8:
      return "A8R8G8B8";
    case D3DFORMAT.A8:
      return "A8";
    case D3DFORMAT.L8:
      return "L8";
    case D3DFORMAT.DXT1:
      return "DXT1";
    case D3DFORMAT.DXT3:
      return "DXT3";
    case D3DFORMAT.DXT5:
      return "DXT5";
    case D3DFORMAT.ATI1:
      return "BC4";
    case D3DFORMAT.ATI2:
      return "BC5";
    case D3DFORMAT.BC7:
      return "BC7";
    default:
      return `0x${(code >>> 0).toString(16).padStart(8, "0")}`;
  }
}

/**
 * Map a {@link TextureFormat} name to the code stored in `Texture.format`.
 *
 * @throws {@link RageFormatError} for a format with no known code.
 */
export function d3dFromFormat(format: TextureFormat): number {
  switch (format) {
    case "A8R8G8B8":
      return D3DFORMAT.A8R8G8B8;
    case "A8":
      return D3DFORMAT.A8;
    case "L8":
      return D3DFORMAT.L8;
    case "DXT1":
      return D3DFORMAT.DXT1;
    case "DXT3":
      return D3DFORMAT.DXT3;
    case "DXT5":
      return D3DFORMAT.DXT5;
    case "BC4":
      return D3DFORMAT.ATI1;
    case "BC5":
      return D3DFORMAT.ATI2;
    case "BC7":
      return D3DFORMAT.BC7;
    default: {
      const m = /^0x([0-9a-f]{8})$/i.exec(format);
      if (m) return parseInt(m[1]!, 16) >>> 0;
      throw new RageFormatError(`no D3DFORMAT code is known for texture format "${format}"`, {
        code: "UNKNOWN_FORMAT",
      });
    }
  }
}

/** A texture read out of a `.ytd` (or embedded in a `.ydr`/`.yft`). */
export interface RageTexture {
  /** Texture name as stored in the resource (usually without an extension). */
  name: string;
  /** joaat hash of the lowercased name — the dictionary key. */
  nameHash: number;
  width: number;
  height: number;
  depth: number;
  /** Row pitch of mip 0 as stored in the resource. */
  stride: number;
  format: TextureFormat;
  /** Number of mip levels present. */
  mipLevels: number;
  /** Byte offset of the mip chain inside the graphics segment. */
  dataOffset: number;
  /** Total size of the mip chain in bytes. */
  dataSize: number;
  /** Raw VFT words as found in the file (preserved for re-writing). */
  vft: number;
  /** Raw bytes of one mip level. */
  levelData(level: number): Buffer;
  /** Build a standalone DDS file containing every mip level. */
  dds(): Buffer;
  /**
   * Decode a mip level to RGBA8.
   *
   * @returns `null` for formats with no decoder (BC4, BC5, BC7, unknown).
   */
  rgba(level?: number): { width: number; height: number; data: Uint8Array } | null;
}

/** A `.ytd` read result: the textures plus the dictionary's raw VFT. */
export interface RageTextureDictionary {
  textures: RageTexture[];
  /** Raw VFT of the `TextureDictionary` structure. */
  vft: number;
  /** Resource version from the RSC7 header. */
  version: number;
}

function requirePointer(p: DecodedPointer | null, what: string): DecodedPointer {
  if (!p) throw new RageFormatError(`${what} pointer is null`, { code: "NULL_POINTER" });
  return p;
}

/**
 * Read a `grcTexture` structure at `ptr` using `reader`.
 *
 * Exported so drawables can read the texture dictionary they embed.
 */
export function readTextureStruct(reader: ResourceReader, ptr: DecodedPointer): RageTexture {
  const { segment, offset } = ptr;
  if (segment !== "system") {
    throw new RageFormatError(`texture struct pointer must be in the system segment`, {
      code: "BAD_POINTER",
      offset,
    });
  }
  const vft = reader.u32(segment, offset + 0x00);
  const namePtr = reader.pointer(segment, offset + 0x20);
  const name = reader.stringAt(namePtr) ?? "";
  const width = reader.u16(segment, offset + 0x48);
  const height = reader.u16(segment, offset + 0x4a);
  const depth = reader.u16(segment, offset + 0x4c);
  const stride = reader.u16(segment, offset + 0x4e);
  const formatCode = reader.u32(segment, offset + 0x50);
  const mipLevels = Math.max(1, reader.u8(segment, offset + 0x55));
  const dataPtr = reader.pointer(segment, offset + 0x68);
  const format = formatFromD3d(formatCode);

  if (width <= 0 || height <= 0) {
    throw new RageFormatError(`texture "${name}" has invalid dimensions ${width}×${height}`, {
      code: "BAD_TEXTURE",
      offset,
    });
  }

  let dataSize = 0;
  try {
    dataSize = mipChainSize(format, width, height, mipLevels);
  } catch {
    throw new RageFormatError(
      `texture "${name}" uses format ${format} (code 0x${formatCode.toString(16)}) whose surface size is unknown`,
      { code: "UNKNOWN_FORMAT", offset },
    );
  }

  const data = requirePointer(dataPtr, `texture "${name}" data`);
  const bytes = reader.bytes(data.segment, data.offset, dataSize);

  const levelSize = (level: number) => ({
    width: Math.max(1, width >> level),
    height: Math.max(1, height >> level),
  });

  const levelData = (level: number): Buffer => {
    if (level < 0 || level >= mipLevels) {
      throw new RageFormatError(
        `mip level ${level} is out of range for "${name}" (0…${mipLevels - 1})`,
        { code: "BAD_LEVEL" },
      );
    }
    let off = 0;
    for (let i = 0; i < level; i++) {
      const s = levelSize(i);
      off += surfaceSize(format, s.width, s.height);
    }
    const s = levelSize(level);
    return bytes.subarray(off, off + surfaceSize(format, s.width, s.height));
  };

  return {
    name,
    nameHash: joaat(name),
    width,
    height,
    depth: depth || 1,
    stride,
    format,
    mipLevels,
    dataOffset: data.offset,
    dataSize,
    vft,
    levelData,
    dds() {
      const surfaces: Buffer[] = [];
      for (let i = 0; i < mipLevels; i++) surfaces.push(levelData(i));
      return assembleDds(format, width, height, surfaces);
    },
    rgba(level = 0) {
      const s = levelSize(level);
      const out = surfaceToRgba(format, levelData(level), s.width, s.height, true);
      return out ? { width: s.width, height: s.height, data: out } : null;
    },
  };
}

/**
 * Read a `TextureDictionary` structure at `ptr`.
 *
 * Exported so drawables can read an embedded dictionary.
 */
export function readTextureDictionaryStruct(
  reader: ResourceReader,
  ptr: DecodedPointer,
): { textures: RageTexture[]; vft: number } {
  const { segment, offset } = ptr;
  const vft = reader.u32(segment, offset + 0x00);
  const hashPtr = reader.pointer(segment, offset + 0x20);
  const hashCount = reader.u16(segment, offset + 0x28);
  const texPtr = reader.pointer(segment, offset + 0x30);
  const texCount = reader.u16(segment, offset + 0x38);

  if (texCount !== hashCount) {
    throw new RageFormatError(
      `texture dictionary has ${hashCount} name hashes but ${texCount} textures`,
      { code: "BAD_DICTIONARY", offset },
    );
  }
  if (texCount === 0) return { textures: [], vft };

  const texArray = requirePointer(texPtr, "texture dictionary entries");
  const hashArray = requirePointer(hashPtr, "texture dictionary name hashes");

  const textures: RageTexture[] = [];
  for (let i = 0; i < texCount; i++) {
    // Entries are 64-bit pointers; the resource tagging lives in the low word.
    const entry = reader.pointer(texArray.segment, texArray.offset + i * 8);
    if (!entry) continue;
    const tex = readTextureStruct(reader, entry);
    const storedHash = reader.u32(hashArray.segment, hashArray.offset + i * 4);
    textures.push({ ...tex, nameHash: storedHash || tex.nameHash });
  }
  return { textures, vft };
}

/**
 * Read a `.ytd` texture dictionary.
 *
 * @param buf - A complete RSC7 `.ytd` file.
 * @returns The textures in dictionary order (ascending name hash).
 * @throws {@link RageFormatError} when the container or the dictionary is
 *   malformed.
 */
export function readYtd(buf: Buffer | Uint8Array): RageTexture[] {
  return readYtdDictionary(buf).textures;
}

/** Like {@link readYtd} but also returns the dictionary VFT and version. */
export function readYtdDictionary(buf: Buffer | Uint8Array): RageTextureDictionary {
  const res = parseRsc7(buf);
  const reader = new ResourceReader(res.systemData, res.graphicsData);
  const { textures, vft } = readTextureDictionaryStruct(reader, { segment: "system", offset: 0 });
  return { textures, vft, version: res.version };
}

/** One texture handed to {@link writeYtd}. */
export interface WriteYtdTexture {
  /** Name stored in the dictionary; also hashed for the key. */
  name: string;
  /** A complete DDS file supplying dimensions, format and every mip level. */
  dds: Buffer | Uint8Array;
  /** Optional VFT to preserve when rewriting a texture read from a real file. */
  vft?: number;
}

/** Options for {@link writeYtd}. */
export interface WriteYtdOptions {
  /** VFT for the `TextureDictionary` structure (default 0). */
  dictionaryVft?: number;
  /** Default VFT for `grcTexture` structures (default 0). */
  textureVft?: number;
}

/**
 * Build a native RSC7 `.ytd` from DDS files.
 *
 * Textures are sorted by `joaat(name.toLowerCase())` as the dictionary's binary
 * search requires. Duplicate name hashes are rejected.
 *
 * @throws {@link RageFormatError} on duplicate names or an unusable DDS.
 */
export function writeYtd(textures: WriteYtdTexture[], options: WriteYtdOptions = {}): Buffer {
  const entries = textures
    .map((t) => {
      const dds = decodeDds(t.dds);
      return { name: t.name, hash: joaat(t.name), dds, vft: t.vft ?? options.textureVft ?? 0 };
    })
    .sort((a, b) => (a.hash === b.hash ? a.name.localeCompare(b.name) : a.hash - b.hash));

  for (let i = 1; i < entries.length; i++) {
    if (entries[i]!.hash === entries[i - 1]!.hash) {
      throw new RageFormatError(
        `textures "${entries[i - 1]!.name}" and "${entries[i]!.name}" collide on name hash 0x${entries[i]!.hash.toString(16)}`,
        { code: "DUPLICATE_KEY" },
      );
    }
  }

  const builder = new ResourceBuilder();
  const count = entries.length;

  // The root structure must sit at system offset 0.
  const dict = builder.system({ size: TEXTURE_DICTIONARY_SIZE, align: 16, label: "TextureDictionary" });
  const hashes = count > 0 ? builder.system({ align: 16, label: "nameHashes" }) : null;
  const pointers = count > 0 ? builder.system({ align: 16, label: "texturePointers" }) : null;

  const texBlocks: Block[] = entries.map((e) =>
    builder.system({ size: TEXTURE_SIZE, align: 16, label: `Texture:${e.name}` }),
  );

  // Texture pixel data lives in the graphics segment.
  const dataBlocks: Block[] = entries.map((e) => {
    const block = builder.graphics({ align: 16, label: `TexData:${e.name}` });
    for (let i = 0; i < e.dds.mips; i++) block.bytes(e.dds.levelData(i));
    return block;
  });

  if (hashes) for (const e of entries) hashes.u32(e.hash);
  // 64-bit pointer entries: low word carries the tagged pointer, high word is 0.
  if (pointers) for (const b of texBlocks) pointers.pointer(b).u32(0);

  entries.forEach((e, i) => {
    const t = texBlocks[i]!;
    const nameBlock = builder.string(e.name);
    t.seek(0x00)
      .u32(e.vft)
      .u32(1) // unknown, always 1
      .u64(0n) // pagesInfo / unknown
      .u64(0n) // unknown
      .u32(1) // reference count
      .u32(0);
    t.seek(0x20).pointer(nameBlock).u32(0).u32(0).u32(0); // name pointer + unknowns (0x20..0x2F)
    t.seek(0x30).zeros(0x18); // 0x30..0x47 unknown
    t.seek(0x48)
      .u16(e.dds.width)
      .u16(e.dds.height)
      .u16(Math.max(1, e.dds.depth))
      .u16(Math.min(0xffff, rowPitch(e.dds.format, e.dds.width)))
      .u32(d3dFromFormat(e.dds.format))
      .u8(0)
      .u8(Math.min(255, e.dds.mips))
      .u16(0)
      .f32(0)
      .u32(0)
      .u32(0)
      .u32(0);
    t.seek(0x68).pointer(dataBlocks[i]!);
    t.seek(0x70).zeros(0x20);
  });

  dict
    .seek(0x00)
    .u32(options.dictionaryVft ?? 0)
    .u32(1)
    .u64(0n) // pagesInfoPointer
    .u32(0)
    .u32(0)
    .u32(0)
    .u32(0)
    .pointer(hashes)
    .u32(0)
    .u16(count)
    .u16(count)
    .u32(0)
    .pointer(pointers)
    .u32(0)
    .u16(count)
    .u16(count)
    .u32(0);

  const built = builder.build();
  return writeRsc7({
    version: RESOURCE_VERSIONS.ytd,
    system: built.system,
    graphics: built.graphics,
    systemMinBaseSize: built.largestSystemBlock,
    graphicsMinBaseSize: built.largestGraphicsBlock,
  });
}
