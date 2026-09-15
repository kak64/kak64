import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JobStage, ProcessorContext, ProgressReporter } from "@modsmith/core";
import { recordJobProgress, redis, storage } from "@modsmith/services";
import { ProcessingError } from "./errors";
import { ensureDir, sha256File } from "./files";
import { safeFetch } from "./fetch";
import { log } from "./log";

/** How long a cancel-flag lookup is cached before Redis is asked again. */
const CANCEL_POLL_MS = 2_000;

export interface WorkerReporter extends ProgressReporter {
  /** Throws CancelledError-equivalent ProcessingError when the user cancelled. */
  assertNotCancelled(): void;
  refreshCancelled(): Promise<boolean>;
  warnings: string[];
  warn(message: string): void;
}

export function createReporter(jobId: string): WorkerReporter {
  let cancelled = false;
  let lastCheck = 0;
  let inflight: Promise<boolean> | null = null;
  const warnings: string[] = [];

  const refresh = async () => {
    if (cancelled) return true;
    const now = Date.now();
    if (now - lastCheck < CANCEL_POLL_MS) return cancelled;
    lastCheck = now;
    if (!inflight) {
      inflight = redis()
        .get(`job:${jobId}:cancel`)
        .then((v) => {
          cancelled = v === "1" || v === "true";
          return cancelled;
        })
        .catch(() => cancelled)
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };

  return {
    warnings,
    warn(message: string) {
      if (!warnings.includes(message)) warnings.push(message);
    },
    async stage(stage: JobStage, progress: number, message?: string) {
      await refresh();
      await recordJobProgress(jobId, { stage, progress: Math.max(0, Math.min(100, Math.round(progress))), message });
    },
    async log(message: string, data?: Record<string, unknown>) {
      log.info({ jobId, ...data }, message);
      await recordJobProgress(jobId, { message, level: "info", data: data as never });
    },
    isCancelled() {
      void refresh();
      return cancelled;
    },
    assertNotCancelled() {
      if (cancelled) throw new ProcessingError("CANCELLED", "Cancelled by user");
    },
    refreshCancelled: refresh,
  };
}

type ContextStorage = ProcessorContext["storage"];

export interface WorkerStorage extends ContextStorage {
  getBuffer(key: string): Promise<Buffer>;
  putBuffer(key: string, body: Buffer, mime: string): Promise<{ size: number; sha256: string }>;
}

export function createStorageAdapter(): WorkerStorage {
  const provider = storage();
  return {
    async download(key: string, toPath: string) {
      const buf = await provider.getObject(key);
      if (!buf) throw new ProcessingError("SOURCE_MISSING", `A source file is no longer available in storage (${key})`, { infrastructure: true, retryable: true });
      await mkdir(path.dirname(toPath), { recursive: true });
      await writeFile(toPath, buf);
    },
    async upload(fromPath: string, key: string, mime: string) {
      const body = await readFile(fromPath);
      await provider.putObject(key, body, mime);
      return { size: body.length, sha256: await sha256File(fromPath) };
    },
    async head(key: string) {
      return provider.headObject(key);
    },
    async getBuffer(key: string) {
      const buf = await provider.getObject(key);
      if (!buf) throw new ProcessingError("SOURCE_MISSING", `A source file is no longer available in storage (${key})`, { infrastructure: true, retryable: true });
      return buf;
    },
    async putBuffer(key: string, body: Buffer, mime: string) {
      await provider.putObject(key, body, mime);
      const { createHash } = await import("node:crypto");
      return { size: body.length, sha256: createHash("sha256").update(body).digest("hex") };
    },
  };
}

export function createProcessorContext(opts: { baseCost: number; jobId?: string }): Omit<ProcessorContext, "storage"> & { storage: WorkerStorage } {
  return {
    storage: createStorageAdapter(),
    baseCost: opts.baseCost,
    async fetchExternal(url: string, o?: { maxBytes?: number }) {
      const r = await safeFetch(url, { maxBytes: o?.maxBytes });
      return { buffer: r.buffer, contentType: r.contentType, finalUrl: r.finalUrl };
    },
    logger: {
      info: (msg, data) => log.info({ jobId: opts.jobId, data }, msg),
      warn: (msg, data) => log.warn({ jobId: opts.jobId, data }, msg),
      error: (msg, data) => log.error({ jobId: opts.jobId, data }, msg),
    },
  };
}

export interface UploadedArtifact {
  name: string;
  key: string;
  mime: string;
  size: number;
  sha256: string;
}

/** Upload a produced file to `results/<userId>/<jobId>/<name>`. */
export async function uploadResult(userId: string, jobId: string, name: string, localPathOrBuffer: string | Buffer, mime: string): Promise<UploadedArtifact> {
  const key = `results/${userId}/${jobId}/${name}`;
  const body = typeof localPathOrBuffer === "string" ? await readFile(localPathOrBuffer) : localPathOrBuffer;
  await storage().putObject(key, body, mime);
  const { createHash } = await import("node:crypto");
  return { name, key, mime, size: body.length, sha256: createHash("sha256").update(body).digest("hex") };
}

/** Stream-friendly size + hash for a local file (used for the main ZIP). */
export async function hashLocal(file: string): Promise<{ sha256: string; size: number }> {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  let size = 0;
  await new Promise<void>((resolve, reject) => {
    createReadStream(file)
      .on("data", (c: Buffer | string) => {
        const b = typeof c === "string" ? Buffer.from(c) : c;
        size += b.length;
        hash.update(b);
      })
      .on("end", () => resolve())
      .on("error", reject);
  });
  return { sha256: hash.digest("hex"), size };
}

export async function jobWorkDir(root: string, jobId: string): Promise<string> {
  return ensureDir(path.join(root, `job-${jobId}`));
}

export const MIME = {
  zip: "application/zip",
  glb: "model/gltf-binary",
  png: "image/png",
  json: "application/json",
  octet: "application/octet-stream",
} as const;
