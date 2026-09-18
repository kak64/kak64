import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { ProcessingError } from "./errors";
import { ensureDir, extOf, walk } from "./files";
import type { InputFile } from "./inputs";
import { extractZip } from "./zip";

export interface StagedFile {
  /** Path relative to the staging directory (posix). */
  rel: string;
  abs: string;
  ext: string;
}

export interface StagedResource {
  dir: string;
  files: StagedFile[];
  /** True when the upload was a full resource ZIP (so the folder layout should be preserved). */
  fromArchive: boolean;
  byExt(...exts: string[]): StagedFile[];
  find(predicate: (f: StagedFile) => boolean): StagedFile | undefined;
}

/**
 * Put the job's uploads on disk as a single tree: ZIPs are extracted (rejecting escrow
 * assets), loose files are copied. This is the common front-end for every processor that
 * edits an existing FiveM resource.
 */
export async function stageResource(inputs: { files: InputFile[] }, workDir: string, opts: { subdir?: string } = {}): Promise<StagedResource> {
  const dir = await ensureDir(path.join(workDir, opts.subdir ?? "resource"));
  let fromArchive = false;
  for (const f of inputs.files) {
    if (f.ext === "zip") {
      fromArchive = true;
      const entries = await extractZip(f.file, dir);
      if (entries.some((e) => /\.fxap$/i.test(e))) {
        throw new ProcessingError("ESCROW_PROTECTED", "This resource is protected by FiveM asset escrow (.fxap) and cannot be modified.");
      }
    } else {
      const dest = path.join(dir, f.name);
      await ensureDir(path.dirname(dest));
      await copyFile(f.file, dest);
    }
  }
  const rels = await walk(dir);
  if (rels.some((r) => /\.fxap$/i.test(r))) {
    throw new ProcessingError("ESCROW_PROTECTED", "This resource is protected by FiveM asset escrow (.fxap) and cannot be modified.");
  }
  const files: StagedFile[] = rels.map((rel) => ({ rel, abs: path.join(dir, rel), ext: extOf(rel) }));
  if (!files.length) throw new ProcessingError("MISSING_INPUT", "No usable files were found in the upload.");
  return {
    dir,
    files,
    fromArchive,
    byExt: (...exts: string[]) => files.filter((f) => exts.map((e) => e.replace(/^\./, "").toLowerCase()).includes(f.ext)),
    find: (predicate) => files.find(predicate),
  };
}

/** Where a streamed file should live inside the produced resource. */
export function streamPath(staged: StagedResource, file: StagedFile): string {
  if (staged.fromArchive) {
    const rel = file.rel.replace(/^[^/]+\//, (m) => (/^(stream|data|audioconfig|sfx|client|server)\//i.test(file.rel) ? m : ""));
    return /(^|\/)stream(ed)?\//i.test(rel) ? rel : `stream/${path.posix.basename(file.rel)}`;
  }
  return `stream/${path.posix.basename(file.rel)}`;
}

export async function readStaged(file: StagedFile): Promise<Buffer> {
  return readFile(file.abs);
}
