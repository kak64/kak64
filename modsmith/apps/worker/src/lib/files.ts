import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

export function sha256Buffer(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function fileSize(file: string): Promise<number> {
  return (await stat(file)).size;
}

export async function exists(file: string): Promise<boolean> {
  try { await stat(file); return true; } catch { return false; }
}

export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Recursively list files under `root`, returning paths relative to root (posix separators). */
export async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  async function rec(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await rec(full);
      else if (e.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  await rec(root);
  return out.sort();
}

export function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1]!.toLowerCase() : "";
}

export function baseName(name: string): string {
  return path.posix.basename(name.replace(/\\/g, "/"));
}

export function stripExt(name: string): string {
  return name.replace(/\.[^./\\]+$/, "");
}

/** Lowercase, safe resource/file identifier. */
export function safeName(input: string, fallback = "asset"): string {
  const s = input.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return s.length >= 2 ? s : fallback;
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
