import { rm } from "node:fs/promises";
import path from "node:path";
import type { AssetInput, ProcessingArtifact, ProcessingResult } from "@modsmith/core";
import { getTool } from "@modsmith/core";
import { prisma } from "@modsmith/db";
import { completeJob, failJob, getEffectiveTool, scanObject, storage } from "@modsmith/services";
import { createProcessorContext, createReporter, hashLocal, jobWorkDir, uploadResult, type UploadedArtifact } from "./lib/context";
import { workerEnv } from "./lib/env";
import { errorMessage, isProcessingError, ProcessingError, TimeoutError } from "./lib/errors";
import { log } from "./lib/log";
import { getProcessor } from "./processors/registry";

export interface RunResult {
  status: "completed" | "failed" | "cancelled" | "skipped";
  code?: string;
}

function artifactMime(name: string): string {
  if (name.endsWith(".glb")) return "model/gltf-binary";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run one ProcessingJob end to end: load it, mark PROCESSING, download the inputs,
 * validate + process, upload artifacts and settle the job through completeJob/failJob.
 * Unexpected exceptions always settle as infrastructure failures so credits are refunded.
 */
export async function runProcessingJob(jobId: string): Promise<RunResult> {
  const job = await prisma.processingJob.findUnique({ where: { id: jobId } });
  if (!job) {
    log.warn({ jobId }, "job not found; ignoring queue message");
    return { status: "skipped" };
  }
  if (["COMPLETED", "CANCELLED", "REFUNDED"].includes(job.status)) {
    log.info({ jobId, status: job.status }, "job already settled; ignoring");
    return { status: "skipped" };
  }

  const env = workerEnv();
  const workDir = await jobWorkDir(env.tmpDir, jobId);
  const reporter = createReporter(jobId);
  const tool = getTool(job.toolSlug);
  const effective = await getEffectiveTool(job.toolSlug).catch(() => null);
  const ctx = createProcessorContext({ baseCost: effective?.creditCost ?? tool?.creditCost ?? 0, jobId });

  const rawInput = (job.input ?? {}) as { files?: { key: string; originalName?: string; size?: number; mime?: string; sha256?: string }[]; externalRef?: { provider: string; id: string; url?: string } | null };
  const input: AssetInput = {
    toolSlug: job.toolSlug,
    userId: job.userId,
    files: (rawInput.files ?? []).map((f) => ({ key: f.key, originalName: f.originalName, size: f.size, mime: f.mime ?? undefined, sha256: f.sha256 ?? undefined })),
    config: (job.config ?? {}) as Record<string, unknown>,
    externalRef: rawInput.externalRef ?? undefined,
  };

  try {
    const processor = getProcessor(job.processor);
    if (!processor) throw new ProcessingError("UNKNOWN_PROCESSOR", `No processor is registered for "${job.processor}"`, { infrastructure: true });

    await prisma.processingJob.update({ where: { id: jobId }, data: { status: "PROCESSING", startedAt: job.startedAt ?? new Date(), stage: "validation", progress: 1 } });
    await reporter.stage("validation", 2, "Checking your files");

    // Deferred malware scan for large uploads (small ones are scanned inline by the web layer).
    await scanPendingUploads(input, jobId);
    reporter.assertNotCancelled();

    const validation = await processor.validate(input, ctx);
    if (!validation.ok) {
      const first = validation.issues.find((i) => i.severity === "error") ?? validation.issues[0];
      throw new ProcessingError(first?.code ?? "VALIDATION_FAILED", first?.message ?? "The uploaded files are not valid for this tool");
    }
    for (const issue of validation.issues) if (issue.severity === "warning") reporter.warn(issue.message);
    reporter.assertNotCancelled();

    const result: ProcessingResult = await withTimeout(
      processor.process({ id: jobId, userId: job.userId, toolSlug: job.toolSlug, input, workDir, attempt: job.attempts, reporter }, ctx),
      env.jobTimeoutMs,
    );

    if (await reporter.refreshCancelled()) {
      await failJob(jobId, { code: "CANCELLED", message: "Cancelled by user", infrastructure: false, cancelled: true });
      return { status: "cancelled" };
    }

    if (!result.ok) {
      await failJob(jobId, { code: result.code, message: result.message, infrastructure: result.infrastructure });
      return { status: "failed", code: result.code };
    }

    await reporter.stage("packaging", 95, "Uploading your download");
    const settled = await publishArtifact(job.userId, jobId, result.artifact, reporter.warnings);
    await completeJob(jobId, {
      resultKey: settled.main.key,
      resultName: result.artifact.fileName,
      resultSize: settled.main.size,
      sha256: settled.main.sha256,
      manifest: settled.manifest,
      thumbnailKey: settled.thumbnailKey,
      facts: result.facts,
    });
    log.info({ jobId, tool: job.toolSlug, processor: job.processor, bytes: settled.main.size, encoder: settled.manifest.encoder }, "job completed");
    return { status: "completed" };
  } catch (err) {
    if (isProcessingError(err) && err.code === "CANCELLED") {
      await failJob(jobId, { code: "CANCELLED", message: "Cancelled by user", infrastructure: false, cancelled: true }).catch((e) => log.error({ e }, "failJob(cancel) failed"));
      return { status: "cancelled" };
    }
    const isKnown = isProcessingError(err);
    const code = isKnown ? (err as ProcessingError).code : err instanceof TimeoutError ? "TIMEOUT" : "INTERNAL";
    const infrastructure = isKnown ? (err as ProcessingError).infrastructure : true;
    const message = errorMessage(err);
    if (!isKnown) log.error({ jobId, err }, "unexpected processor failure");
    else log.warn({ jobId, code, message }, "job failed");
    await failJob(jobId, { code, message, infrastructure }).catch((e) => log.error({ e, jobId }, "failJob failed"));
    return { status: "failed", code };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Upload the ZIP/primary artifact plus every extra artifact, and assemble the result manifest. */
async function publishArtifact(userId: string, jobId: string, artifact: ProcessingArtifact, warnings: string[]) {
  const hashed = await hashLocal(artifact.localPath);
  const key = `results/${userId}/${jobId}/${artifact.fileName}`;
  const { readFile } = await import("node:fs/promises");
  await storage().putObject(key, await readFile(artifact.localPath), artifact.mime);
  const main: UploadedArtifact = { name: artifact.fileName, key, mime: artifact.mime, size: hashed.size, sha256: hashed.sha256 };

  const manifest = { ...(artifact.manifest ?? {}) } as Record<string, unknown>;
  const artifacts: { name: string; key: string; mime: string; size: number }[] = Array.isArray(manifest.artifacts) ? [...(manifest.artifacts as { name: string; key: string; mime: string; size: number }[])] : [];

  // Extra artifacts declared by the processor as local paths.
  const extras = (manifest.__extraArtifacts as { name: string; path: string }[] | undefined) ?? [];
  delete manifest.__extraArtifacts;
  for (const extra of extras) {
    const up = await uploadResult(userId, jobId, extra.name, extra.path, artifactMime(extra.name));
    artifacts.push({ name: up.name, key: up.key, mime: up.mime, size: up.size });
  }

  let thumbnailKey: string | null = null;
  if (artifact.thumbnailPath) {
    const thumb = await uploadResult(userId, jobId, "thumbnail.png", artifact.thumbnailPath, "image/png");
    thumbnailKey = thumb.key;
    artifacts.push({ name: thumb.name, key: thumb.key, mime: thumb.mime, size: thumb.size });
  }
  if (artifact.previewPath) {
    const preview = await uploadResult(userId, jobId, "preview.glb", artifact.previewPath, "model/gltf-binary");
    if (!artifacts.some((a) => a.name === "preview.glb")) artifacts.push({ name: preview.name, key: preview.key, mime: preview.mime, size: preview.size });
  }
  artifacts.unshift({ name: main.name, key: main.key, mime: main.mime, size: main.size });

  const mergedWarnings = [...new Set([...(Array.isArray(manifest.warnings) ? (manifest.warnings as string[]) : []), ...warnings])];
  manifest.artifacts = artifacts;
  manifest.warnings = mergedWarnings;
  if (!manifest.encoder) manifest.encoder = "native";
  if (thumbnailKey) manifest.thumbnailKey = thumbnailKey;
  return { main, manifest, thumbnailKey };
}

/** Scan uploads that the web layer deferred (>32 MiB). Rejects the upload when infected. */
async function scanPendingUploads(input: AssetInput, jobId: string) {
  if (!input.files.length) return;
  const pending = await prisma.assetUpload.findMany({
    where: { userId: input.userId, storageKey: { in: input.files.map((f) => f.key) }, scanStatus: "pending" },
    select: { id: true, storageKey: true, originalName: true },
  });
  for (const upload of pending) {
    const verdict = await scanObject(upload.storageKey);
    if (verdict.clean === false) {
      await prisma.assetUpload.update({ where: { id: upload.id }, data: { status: "REJECTED", scanStatus: "infected", rejectReason: `Malware signature: ${verdict.signature}` } });
      throw new ProcessingError("MALWARE_DETECTED", `${upload.originalName} was rejected by the malware scanner (${verdict.signature})`);
    }
    await prisma.assetUpload.update({ where: { id: upload.id }, data: { scanStatus: verdict.clean === true ? "clean" : "skipped" } }).catch(() => {});
    log.info({ jobId, uploadId: upload.id, verdict: verdict.clean }, "deferred malware scan complete");
  }
}

export function resultsPrefix(userId: string, jobId: string): string {
  return path.posix.join("results", userId, jobId);
}
