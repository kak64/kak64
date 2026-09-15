import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AssetInput, StorageRef } from "@modsmith/core";
import { ProcessingError } from "./errors";
import { ensureDir, extOf } from "./files";


export interface InputFile {
  ref: StorageRef;
  /** Local path inside the job work dir. */
  file: string;
  name: string;
  ext: string;
  size: number;
}

export interface DownloadedInputs {
  files: InputFile[];
  dir: string;
  byExt(...exts: string[]): InputFile[];
  first(...exts: string[]): InputFile | undefined;
  /** Resolve a config reference (upload id, storage key or file name) to a downloaded file. */
  resolve(reference: string): InputFile | undefined;
  require(reference: string, label: string): InputFile;
}

function refMatches(f: InputFile, reference: string): boolean {
  const ref = reference.trim();
  if (!ref) return false;
  if (f.ref.key === ref) return true;
  if (f.name === ref) return true;
  if (path.posix.basename(f.ref.key) === ref) return true;
  // uploads/<userId>/<uploadId>/<name>
  const segments = f.ref.key.split("/");
  if (segments.includes(ref)) return true;
  if (f.ref.sha256 && f.ref.sha256 === ref) return true;
  return false;
}

export interface InputDownloader {
  download(key: string, toPath: string): Promise<void>;
}

/** Download every input object into `<workDir>/input` and index them for lookup. */
export async function downloadInputs(input: AssetInput, workDir: string, storage: InputDownloader): Promise<DownloadedInputs> {
  const dir = await ensureDir(path.join(workDir, "input"));
  const files: InputFile[] = [];
  const usedNames = new Set<string>();
  for (const ref of input.files) {
    const original = (ref.originalName || path.posix.basename(ref.key) || "input.bin").replace(/[/\\]/g, "_");
    let name = original;
    let i = 1;
    while (usedNames.has(name.toLowerCase())) {
      const ext = extOf(original);
      name = `${original.replace(/\.[^.]+$/, "")}_${i++}${ext ? `.${ext}` : ""}`;
    }
    usedNames.add(name.toLowerCase());
    const file = path.join(dir, name);
    await storage.download(ref.key, file);
    const size = ref.size ?? (await readFile(file)).length;
    files.push({ ref, file, name, ext: extOf(name), size });
  }
  return {
    files,
    dir,
    byExt: (...exts: string[]) => files.filter((f) => exts.map((e) => e.replace(/^\./, "").toLowerCase()).includes(f.ext)),
    first: (...exts: string[]) => files.find((f) => exts.map((e) => e.replace(/^\./, "").toLowerCase()).includes(f.ext)),
    resolve: (reference: string) => files.find((f) => refMatches(f, reference)),
    require(reference: string, label: string) {
      const found = files.find((f) => refMatches(f, reference));
      if (!found) throw new ProcessingError("MISSING_INPUT", `${label} was not part of this job's uploads (${reference})`);
      return found;
    },
  };
}

export const MODEL_EXTS = ["glb", "gltf", "obj", "dae", "fbx"];
export const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "dds", "bmp", "tga"];
export const RAGE_EXTS = ["ydr", "yft", "ydd", "ytd", "ybn", "ytyp"];
export const ARCHIVE_EXTS = ["zip", "rar", "7z", "oiv", "rpf"];
