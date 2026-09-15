import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import archiver from "archiver";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { ProcessingError } from "./errors";

export const ZIP_LIMITS = {
  maxEntries: 20_000,
  maxExpandedBytes: 4 * 1024 * 1024 * 1024, // 4 GiB
  maxCompressionRatio: 200,
  maxNestedDepth: 2,
} as const;

/** Extensions that are never legitimate inside a FiveM resource archive. */
const EXECUTABLE_EXT = new Set(["exe", "dll", "bat", "cmd", "com", "scr", "msi", "ps1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "sh", "so", "dylib", "app", "jar", "pif", "cpl", "hta", "reg", "lnk"]);
const ARCHIVE_EXT = new Set(["zip", "rar", "7z", "oiv", "tar", "gz", "tgz", "bz2", "xz"]);

export interface ZipEntryInfo {
  path: string;
  size: number;
  compressedSize: number;
  isDirectory: boolean;
  crc32: number;
}

export interface ZipListing {
  entries: ZipEntryInfo[];
  totalExpanded: number;
  totalCompressed: number;
}

function openZip(file: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false, decodeStrings: true, validateEntrySizes: true, strictFileNames: false }, (err, zf) => {
      if (err || !zf) return reject(new ProcessingError("INVALID_FILE", `Not a valid ZIP archive: ${err?.message ?? "unknown error"}`));
      resolve(zf);
    });
  });
}

function readAllEntries(zf: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = [];
    zf.on("entry", (e: Entry) => {
      entries.push(e);
      if (entries.length > ZIP_LIMITS.maxEntries) return reject(new ProcessingError("MALICIOUS_ARCHIVE", `Archive has more than ${ZIP_LIMITS.maxEntries} entries`));
      zf.readEntry();
    });
    zf.on("end", () => resolve(entries));
    zf.on("error", (e: Error) => reject(zipReadError(e)));
    zf.readEntry();
  });
}

/** Normalise an entry path and reject anything that could escape the destination directory. */
export function sanitizeEntryPath(name: string): string | null {
  const unified = name.replace(/\\/g, "/");
  if (unified.includes("\0")) return null;
  if (/^[A-Za-z]:/.test(unified) || unified.startsWith("/") || unified.startsWith("//")) return null;
  const parts = unified.split("/").filter((p) => p.length > 0 && p !== ".");
  if (parts.some((p) => p === "..")) return null;
  if (parts.length === 0) return null;
  return parts.join("/");
}

/** yauzl rejects traversal/absolute entry names itself; surface those as archive abuse. */
function zipReadError(e: Error): ProcessingError {
  if (/relative path|absolute path|invalid characters|backslash/i.test(e.message)) {
    return new ProcessingError("MALICIOUS_ARCHIVE", `Archive contains an unsafe entry name: ${e.message}`);
  }
  return new ProcessingError("INVALID_FILE", `Corrupt ZIP archive: ${e.message}`);
}

function isSymlink(entry: Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0xf000) === 0xa000;
}

export function extOfPath(p: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(p);
  return m ? m[1]!.toLowerCase() : "";
}

/** Validate an archive's structure without extracting it. Throws ProcessingError on abuse. */
export async function listZip(file: string): Promise<ZipListing> {
  const size = (await stat(file)).size;
  const zf = await openZip(file);
  try {
    const entries = await readAllEntries(zf);
    let totalExpanded = 0;
    let totalCompressed = 0;
    const out: ZipEntryInfo[] = [];
    for (const e of entries) {
      const isDir = e.fileName.endsWith("/");
      const safe = sanitizeEntryPath(e.fileName);
      if (!safe) throw new ProcessingError("MALICIOUS_ARCHIVE", `Archive entry "${e.fileName}" escapes the extraction directory`);
      if (isSymlink(e)) throw new ProcessingError("MALICIOUS_ARCHIVE", `Archive contains a symbolic link (${safe}); symlinks are not allowed`);
      if (e.isEncrypted()) throw new ProcessingError("INVALID_FILE", `Archive entry "${safe}" is password protected`);
      if (!isDir) {
        const ext = extOfPath(safe);
        if (EXECUTABLE_EXT.has(ext)) throw new ProcessingError("MALICIOUS_ARCHIVE", `Archive contains an executable file (${safe})`);
      }
      totalExpanded += e.uncompressedSize;
      totalCompressed += e.compressedSize;
      if (totalExpanded > ZIP_LIMITS.maxExpandedBytes) throw new ProcessingError("MALICIOUS_ARCHIVE", "Archive expands to more than 4 GB");
      out.push({ path: safe, size: e.uncompressedSize, compressedSize: e.compressedSize, isDirectory: isDir, crc32: e.crc32 });
    }
    const ratio = totalExpanded / Math.max(1, Math.min(size, totalCompressed || size));
    if (totalExpanded > 1024 * 1024 && ratio > ZIP_LIMITS.maxCompressionRatio) {
      throw new ProcessingError("MALICIOUS_ARCHIVE", `Suspicious compression ratio (${Math.round(ratio)}:1); this looks like a zip bomb`);
    }
    return { entries: out, totalExpanded, totalCompressed };
  } finally {
    zf.close();
  }
}

export interface ExtractOptions {
  /** Only extract entries whose path passes the filter. */
  filter?: (entryPath: string) => boolean;
  /** Reject nested archives (zip inside zip) beyond this depth. Default: nested archives are extracted once. */
  depth?: number;
  onFile?: (entryPath: string, size: number) => void;
}

/** Safely extract a ZIP into `dest`. Returns extracted relative paths. */
export async function extractZip(file: string, dest: string, opts: ExtractOptions = {}): Promise<string[]> {
  const depth = opts.depth ?? 0;
  const listing = await listZip(file);
  const zf = await openZip(file);
  const extracted: string[] = [];
  const nested: string[] = [];
  try {
    const entries = await readAllEntries(zf);
    for (const e of entries) {
      const safe = sanitizeEntryPath(e.fileName)!;
      if (e.fileName.endsWith("/")) { await mkdir(path.join(dest, safe), { recursive: true }); continue; }
      if (opts.filter && !opts.filter(safe)) continue;
      const target = path.join(dest, safe);
      const resolved = path.resolve(target);
      if (!resolved.startsWith(path.resolve(dest) + path.sep)) throw new ProcessingError("MALICIOUS_ARCHIVE", `Archive entry "${safe}" escapes the extraction directory`);
      await mkdir(path.dirname(target), { recursive: true });
      await new Promise<void>((resolve, reject) => {
        zf.openReadStream(e, (err, stream) => {
          if (err || !stream) return reject(new ProcessingError("INVALID_FILE", `Cannot read "${safe}": ${err?.message ?? "unknown"}`));
          let written = 0;
          stream.on("data", (chunk: Buffer) => {
            written += chunk.length;
            if (written > e.uncompressedSize + 1024) { stream.destroy(new ProcessingError("MALICIOUS_ARCHIVE", `Entry "${safe}" is larger than declared`)); }
          });
          pipeline(stream, createWriteStream(target)).then(resolve, reject);
        });
      });
      extracted.push(safe);
      opts.onFile?.(safe, e.uncompressedSize);
      if (ARCHIVE_EXT.has(extOfPath(safe)) && extOfPath(safe) === "zip") nested.push(safe);
    }
  } finally {
    zf.close();
  }
  // Nested ZIPs: extract one level (common for mod downloads that wrap a resource in a second archive).
  if (nested.length && depth < ZIP_LIMITS.maxNestedDepth) {
    for (const n of nested) {
      const inner = path.join(dest, n);
      const innerDest = path.join(dest, n.replace(/\.zip$/i, ""));
      try {
        const innerFiles = await extractZip(inner, innerDest, { ...opts, depth: depth + 1 });
        for (const f of innerFiles) extracted.push(path.posix.join(n.replace(/\.zip$/i, ""), f));
      } catch (err) {
        if (err instanceof ProcessingError && err.code === "MALICIOUS_ARCHIVE") throw err;
        // leave the inner archive in place if it cannot be read
      }
    }
  } else if (nested.length && depth >= ZIP_LIMITS.maxNestedDepth) {
    throw new ProcessingError("MALICIOUS_ARCHIVE", "Archive nests other archives too deeply");
  }
  void listing;
  return extracted;
}

export interface ZipInputFile {
  /** Path inside the archive (posix). */
  name: string;
  /** Either a local file or a Buffer. */
  file?: string;
  content?: Buffer | string;
}

/** Create a ZIP with archiver; returns total entries written. */
export async function createZip(outFile: string, files: ZipInputFile[], opts: { level?: number } = {}): Promise<{ entries: number }> {
  await mkdir(path.dirname(outFile), { recursive: true });
  const out = createWriteStream(outFile);
  const archive = archiver("zip", { zlib: { level: opts.level ?? 6 } });
  const done = new Promise<void>((resolve, reject) => {
    out.on("close", () => resolve());
    out.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (w) => { if ((w as { code?: string }).code !== "ENOENT") reject(w); });
  });
  archive.pipe(out);
  let entries = 0;
  for (const f of files) {
    const name = sanitizeEntryPath(f.name);
    if (!name) continue;
    if (f.file) archive.file(f.file, { name });
    else archive.append(f.content ?? "", { name });
    entries++;
  }
  await archive.finalize();
  await done;
  return { entries };
}

/** Recursively add a directory to the file list under `prefix`. */
export async function dirToZipInputs(dir: string, prefix: string): Promise<ZipInputFile[]> {
  const { walk } = await import("./files");
  const files = await walk(dir);
  return files.map((rel) => ({ name: path.posix.join(prefix, rel), file: path.join(dir, rel) }));
}
