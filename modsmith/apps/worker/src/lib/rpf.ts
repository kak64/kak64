import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { ProcessingError } from "./errors";

/**
 * Reader for RPF7 archives (GTA V). Only unencrypted ("OPEN") archives are supported —
 * AES/NG-encrypted archives require game keys we do not ship, and are rejected with RPF_ENCRYPTED.
 *
 * Layout: 16-byte header, EntryCount × 16-byte entries, NamesLength-byte name table.
 * Entry kinds are distinguished by the dword at +4 (0x7FFFFF00 = directory) and the
 * top bit of the dword at +12 (set = resource entry, clear = binary entry).
 */

export const RPF7_MAGIC = 0x52504637; // 'RPF7'
export const ENCRYPTION_OPEN = 0x4e45504f; // 'OPEN'
export const ENCRYPTION_AES = 0x0ffffff9;
export const DIRECTORY_IDENT = 0x7fffff00;
export const RSC7_MAGIC = 0x37435352; // 'RSC7'

export interface RpfHeader {
  version: number;
  entryCount: number;
  namesLength: number;
  encryption: number;
}

export type RpfEntryType = "directory" | "binary" | "resource";

export interface RpfEntry {
  name: string;
  path: string;
  type: RpfEntryType;
  /** Byte offset within the archive (already multiplied by 512). */
  offset: number;
  /** Stored (possibly deflate-compressed) size. 0 = stored uncompressed. */
  storedSize: number;
  /** Uncompressed payload size. */
  size: number;
  systemFlags?: number;
  graphicsFlags?: number;
  encrypted?: boolean;
  /** Directory entries only. */
  firstChild?: number;
  childCount?: number;
}

export interface RpfArchive {
  header: RpfHeader;
  entries: RpfEntry[];
  files: RpfEntry[];
}

function pageFlagSize(flags: number): number {
  // RAGE page flags: 9 size buckets scaled from a base page size.
  const base = 0x2000 << (flags & 0xf);
  let size = base * (((flags >> 4) & 0x1) << 0);
  size += base * (((flags >> 5) & 0x3) << 1);
  size += base * (((flags >> 7) & 0xf) << 2);
  size += base * (((flags >> 11) & 0x3f) << 3);
  size += base * (((flags >> 17) & 0x7f) << 4);
  size += base * (((flags >> 24) & 0x1) << 5);
  size += base * (((flags >> 25) & 0x1) << 6);
  size += base * (((flags >> 26) & 0x1) << 7);
  size += base * (((flags >> 27) & 0x1) << 8);
  return size;
}

export function resourceSizes(systemFlags: number, graphicsFlags: number): { systemSize: number; graphicsSize: number } {
  return { systemSize: pageFlagSize(systemFlags), graphicsSize: pageFlagSize(graphicsFlags) };
}

export function versionFromFlags(systemFlags: number, graphicsFlags: number): number {
  return (((systemFlags >>> 28) & 0xf) << 4) + ((graphicsFlags >>> 28) & 0xf);
}

function readName(names: Buffer, offset: number): string {
  if (offset >= names.length) return "";
  let end = offset;
  while (end < names.length && names[end] !== 0) end++;
  return names.subarray(offset, end).toString("utf8");
}

/** Parse an RPF7 archive's table of contents. Throws RPF_ENCRYPTED for encrypted archives. */
export function readRpf(buf: Buffer): RpfArchive {
  if (buf.length < 16) throw new ProcessingError("INVALID_RPF", "File is too small to be an RPF archive");
  const version = buf.readUInt32LE(0);
  if (version !== RPF7_MAGIC) throw new ProcessingError("INVALID_RPF", "Not an RPF7 archive (GTA V archives start with 'RPF7')");
  const entryCount = buf.readUInt32LE(4);
  const namesLength = buf.readUInt32LE(8);
  const encryption = buf.readUInt32LE(12);
  if (encryption !== ENCRYPTION_OPEN) {
    throw new ProcessingError(
      "RPF_ENCRYPTED",
      encryption === ENCRYPTION_AES
        ? "This archive is AES-encrypted. Export it with OpenIV/CodeWalker as an OPEN archive, or upload the loose files."
        : "This archive is NG-encrypted. Export it with OpenIV/CodeWalker as an OPEN archive, or upload the loose files.",
    );
  }
  const entriesEnd = 16 + entryCount * 16;
  if (entryCount > 200_000 || entriesEnd + namesLength > buf.length) throw new ProcessingError("INVALID_RPF", "The archive's table of contents is corrupt");
  const names = buf.subarray(entriesEnd, entriesEnd + namesLength);

  interface Raw { entry: RpfEntry; nameOffset: number }
  const raws: Raw[] = [];
  for (let i = 0; i < entryCount; i++) {
    const off = 16 + i * 16;
    const y = buf.readUInt32LE(off + 4);
    const x = buf.readUInt32LE(off + 12);
    if (y === DIRECTORY_IDENT) {
      const nameOffset = buf.readUInt32LE(off);
      raws.push({
        nameOffset,
        entry: { name: "", path: "", type: "directory", offset: 0, storedSize: 0, size: 0, firstChild: buf.readUInt32LE(off + 8), childCount: buf.readUInt32LE(off + 12) },
      });
    } else if ((x & 0x80000000) === 0) {
      // binary: [nameOffset:16][fileSize:24][fileOffset:24] then uncompressedSize, encryptionType
      const lo = buf.readUInt32LE(off);
      const hi = buf.readUInt32LE(off + 4);
      const nameOffset = lo & 0xffff;
      const storedSize = ((lo >>> 16) | ((hi & 0xff) << 16)) >>> 0;
      const fileOffset = (hi >>> 8) & 0xffffff;
      const uncompressed = buf.readUInt32LE(off + 8);
      const encType = buf.readUInt32LE(off + 12);
      raws.push({
        nameOffset,
        entry: { name: "", path: "", type: "binary", offset: fileOffset * 512, storedSize, size: uncompressed || storedSize, encrypted: encType !== 0 && encType !== ENCRYPTION_OPEN },
      });
    } else {
      const nameOffset = buf.readUInt16LE(off);
      const storedSize = buf.readUInt8(off + 2) | (buf.readUInt8(off + 3) << 8) | (buf.readUInt8(off + 4) << 16);
      const fileOffset = (buf.readUInt8(off + 5) | (buf.readUInt8(off + 6) << 8) | (buf.readUInt8(off + 7) << 16)) & 0x7fffff;
      const systemFlags = buf.readUInt32LE(off + 8);
      const graphicsFlags = buf.readUInt32LE(off + 12);
      const { systemSize, graphicsSize } = resourceSizes(systemFlags, graphicsFlags);
      raws.push({
        nameOffset,
        entry: { name: "", path: "", type: "resource", offset: fileOffset * 512, storedSize, size: systemSize + graphicsSize, systemFlags, graphicsFlags },
      });
    }
  }
  for (const r of raws) r.entry.name = readName(names, r.nameOffset);

  // Resolve full paths by walking the directory tree from the root entry (index 0).
  const entries = raws.map((r) => r.entry);
  const assign = (dirIndex: number, prefix: string) => {
    const dir = entries[dirIndex];
    if (!dir || dir.type !== "directory") return;
    dir.path = prefix ? `${prefix}/${dir.name}` : dir.name;
    const start = dir.firstChild ?? 0;
    const count = dir.childCount ?? 0;
    for (let i = start; i < start + count && i < entries.length; i++) {
      const child = entries[i]!;
      if (child.type === "directory") assign(i, dir.path);
      else child.path = dir.path ? `${dir.path}/${child.name}` : child.name;
    }
  };
  if (entries.length) assign(0, "");
  for (const e of entries) if (!e.path) e.path = e.name;
  return { header: { version, entryCount, namesLength, encryption }, entries, files: entries.filter((e) => e.type !== "directory") };
}

/** Extract one entry. Resource entries get their RSC7 header reconstructed from the entry flags. */
export function extractRpfEntry(buf: Buffer, entry: RpfEntry): Buffer {
  if (entry.type === "directory") throw new ProcessingError("INVALID_RPF", `${entry.path} is a directory`);
  if (entry.encrypted) throw new ProcessingError("RPF_ENCRYPTED", `${entry.path} is encrypted and cannot be extracted`);
  const length = entry.storedSize > 0 ? entry.storedSize : entry.size;
  if (entry.offset + length > buf.length) throw new ProcessingError("INVALID_RPF", `${entry.path} points outside the archive`);
  let data = buf.subarray(entry.offset, entry.offset + length);
  if (entry.storedSize > 0) {
    try {
      data = inflateRawSync(data);
    } catch (err) {
      if (entry.type === "binary" && entry.size === entry.storedSize) {
        // Stored without compression.
      } else {
        throw new ProcessingError("INVALID_RPF", `Could not decompress ${entry.path}: ${(err as Error).message}`);
      }
    }
  }
  if (entry.type === "resource") {
    const header = Buffer.alloc(16);
    header.writeUInt32LE(RSC7_MAGIC, 0);
    header.writeUInt32LE(versionFromFlags(entry.systemFlags ?? 0, entry.graphicsFlags ?? 0), 4);
    header.writeUInt32LE(entry.systemFlags ?? 0, 8);
    header.writeUInt32LE(entry.graphicsFlags ?? 0, 12);
    return Buffer.concat([header, data]);
  }
  return Buffer.from(data);
}

export interface ExtractedRpfFile {
  path: string;
  data: Buffer;
  type: RpfEntryType;
}

/** Extract every matching file, recursing into nested .rpf archives. */
export function extractRpfFiles(buf: Buffer, opts: { filter?: (path: string) => boolean; prefix?: string; maxDepth?: number; depth?: number } = {}): ExtractedRpfFile[] {
  const archive = readRpf(buf);
  const out: ExtractedRpfFile[] = [];
  const depth = opts.depth ?? 0;
  const maxDepth = opts.maxDepth ?? 3;
  for (const entry of archive.files) {
    const full = opts.prefix ? `${opts.prefix}/${entry.path}` : entry.path;
    if (/\.rpf$/i.test(entry.name)) {
      if (depth >= maxDepth) continue;
      try {
        const nested = extractRpfEntry(buf, entry);
        out.push(...extractRpfFiles(nested, { ...opts, prefix: full, depth: depth + 1 }));
      } catch (err) {
        if (err instanceof ProcessingError && err.code === "RPF_ENCRYPTED") throw err;
      }
      continue;
    }
    if (opts.filter && !opts.filter(full)) continue;
    try {
      out.push({ path: full, data: extractRpfEntry(buf, entry), type: entry.type });
    } catch (err) {
      if (err instanceof ProcessingError && err.code === "RPF_ENCRYPTED") throw err;
    }
  }
  return out;
}

export async function readRpfFile(file: string): Promise<RpfArchive> {
  return readRpf(await readFile(file));
}

export function isRsc7(buf: Buffer): boolean {
  return buf.length >= 16 && buf.readUInt32LE(0) === RSC7_MAGIC;
}

/** Parse an RSC7 header locally (used by the optimizer when the rage reader is unavailable). */
export function parseRsc7Header(buf: Buffer): { version: number; systemSize: number; graphicsSize: number } | null {
  if (!isRsc7(buf)) return null;
  const version = buf.readUInt32LE(4);
  const systemFlags = buf.readUInt32LE(8);
  const graphicsFlags = buf.readUInt32LE(12);
  const { systemSize, graphicsSize } = resourceSizes(systemFlags, graphicsFlags);
  return { version, systemSize, graphicsSize };
}
