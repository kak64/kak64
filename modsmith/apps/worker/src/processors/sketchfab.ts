import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { AssetInput, AssetProcessor, CostEstimate, ProcessingJob, ProcessingResult, ProcessorContext, ValidationResult } from "@modsmith/core";
import { LIMITS } from "@modsmith/core";
import { prisma } from "@modsmith/db";
import { storage } from "@modsmith/services";
import type { WorkerReporter } from "../lib/context";
import { workerEnv } from "../lib/env";
import { ProcessingError } from "../lib/errors";
import { sha256Buffer } from "../lib/files";
import { loadModel } from "../lib/gltf";
import { triangleCount } from "../lib/mesh";
import { renderMeshThumbnail } from "../lib/thumbnail";
import { createZip } from "../lib/zip";

const SKETCHFAB_API = "https://api.sketchfab.com/v3";
const MAX_MODEL_BYTES = 512 * 1024 * 1024;

interface SketchfabModel {
  uid: string;
  name: string;
  user?: { username?: string; displayName?: string; profileUrl?: string };
  license?: { label?: string; slug?: string; url?: string; requirements?: string };
  viewerUrl?: string;
  thumbnails?: { images?: { url?: string; width?: number }[] };
  isDownloadable?: boolean;
}

async function sketchfabGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Token ${token}`, accept: "application/json" } });
  if (res.status === 401 || res.status === 403) throw new ProcessingError("SKETCHFAB_AUTH", "Our Sketchfab credentials were rejected.", { infrastructure: true });
  if (res.status === 404) throw new ProcessingError("MODEL_NOT_FOUND", "That Sketchfab model no longer exists or is private.");
  if (!res.ok) throw new ProcessingError("SKETCHFAB_ERROR", `Sketchfab returned HTTP ${res.status}`, { retryable: res.status >= 500 || res.status === 429, infrastructure: res.status >= 500 });
  return (await res.json()) as T;
}

export const sketchfabProcessor: AssetProcessor = {
  name: "sketchfab",

  async validate(input: AssetInput): Promise<ValidationResult> {
    const issues: ValidationResult["issues"] = [];
    const uid = input.externalRef?.id ?? (input.config.uid as string | undefined);
    if (!uid) issues.push({ code: "MISSING_INPUT", message: "No Sketchfab model was selected.", severity: "error" });
    if (!workerEnv().sketchfabToken) {
      issues.push({ code: "SKETCHFAB_NOT_CONFIGURED", message: "Sketchfab imports are not configured on this server.", severity: "error" });
    }
    return { ok: !issues.some((i) => i.severity === "error"), issues };
  },

  async process(job: ProcessingJob): Promise<ProcessingResult> {
    const reporter = job.reporter as WorkerReporter;
    const token = workerEnv().sketchfabToken;
    if (!token) throw new ProcessingError("SKETCHFAB_NOT_CONFIGURED", "Sketchfab imports are not configured on this server.", { infrastructure: true });
    const uid = job.input.externalRef?.id ?? (job.input.config.uid as string | undefined);
    if (!uid || !/^[a-z0-9]{8,64}$/i.test(uid)) throw new ProcessingError("MISSING_INPUT", "No valid Sketchfab model id was provided.");

    await reporter.stage("importing", 10, "Looking up the model");
    const model = await sketchfabGet<SketchfabModel>(`${SKETCHFAB_API}/models/${uid}`, token);
    const license = model.license?.label ?? model.license?.slug ?? "Unknown";
    const author = model.user?.displayName ?? model.user?.username ?? "Unknown";
    const sourceUrl = model.viewerUrl ?? `https://sketchfab.com/3d-models/${uid}`;

    // Reuse the cached copy when we already fetched this model.
    const cached = await prisma.externalModelCache.findUnique({ where: { provider_externalId: { provider: "sketchfab", externalId: uid } } });
    let glb: Buffer | null = null;
    if (cached?.storageKey) {
      glb = await storage().getObject(cached.storageKey);
      if (glb) await reporter.log("Using the cached copy of this model");
    }

    if (!glb) {
      if (model.isDownloadable === false) {
        throw new ProcessingError("MODEL_NOT_DOWNLOADABLE", "The author has not made that model downloadable on Sketchfab.");
      }
      await reporter.stage("importing", 30, "Requesting the download");
      const download = await sketchfabGet<{ glb?: { url?: string; size?: number }; gltf?: { url?: string; size?: number } }>(`${SKETCHFAB_API}/models/${uid}/download`, token);
      const source = download.glb ?? download.gltf;
      if (!source?.url) throw new ProcessingError("MODEL_NOT_DOWNLOADABLE", "Sketchfab did not return a downloadable file for that model.");
      if ((source.size ?? 0) > MAX_MODEL_BYTES) throw new ProcessingError("FILE_TOO_LARGE", "That model is larger than the 512 MB import limit.");

      await reporter.stage("importing", 45, "Downloading the model");
      const res = await fetch(source.url);
      if (!res.ok) throw new ProcessingError("SKETCHFAB_ERROR", `The model download failed (HTTP ${res.status})`, { retryable: true, infrastructure: res.status >= 500 });
      glb = Buffer.from(await res.arrayBuffer());
      if (glb.length > MAX_MODEL_BYTES) throw new ProcessingError("FILE_TOO_LARGE", "That model is larger than the 512 MB import limit.");
    }
    reporter.assertNotCancelled();

    const cacheKey = `external/sketchfab/${uid}/model.glb`;
    await storage().putObject(cacheKey, glb, "model/gltf-binary");
    await prisma.externalModelCache.upsert({
      where: { provider_externalId: { provider: "sketchfab", externalId: uid } },
      create: {
        provider: "sketchfab",
        externalId: uid,
        name: model.name ?? uid,
        author,
        authorUrl: model.user?.profileUrl ?? null,
        license,
        licenseUrl: model.license?.url ?? null,
        sourceUrl,
        storageKey: cacheKey,
        thumbnailUrl: model.thumbnails?.images?.[0]?.url ?? null,
        metadata: { requirements: model.license?.requirements ?? null },
      },
      update: { storageKey: cacheKey, license, author, sourceUrl, fetchedAt: new Date() },
    });

    await reporter.stage("converting", 65, "Checking the model");
    const glbPath = path.join(job.workDir, "model.glb");
    await writeFile(glbPath, glb);
    const loaded = await loadModel(glbPath);
    const triangles = triangleCount(loaded.meshes);

    const sha256 = sha256Buffer(glb);
    const upload = await prisma.assetUpload.create({
      data: {
        userId: job.userId,
        toolSlug: "prop-creator",
        originalName: `${(model.name ?? uid).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60)}.glb`,
        storageKey: `uploads/${job.userId}/sketchfab-${uid}-${job.id}/model.glb`,
        sizeBytes: BigInt(glb.length),
        declaredMime: "model/gltf-binary",
        detectedMime: "model/gltf-binary",
        sha256,
        status: "UPLOADED",
        scanStatus: "skipped",
        expiresAt: new Date(Date.now() + LIMITS.UPLOAD_TTL_HOURS * 3_600_000),
      },
    });
    await storage().putObject(upload.storageKey, glb, "model/gltf-binary");

    await reporter.stage("packaging", 88, "Packaging the download");
    const licenseText = [
      `Model:   ${model.name ?? uid}`,
      `Author:  ${author}`,
      `Source:  ${sourceUrl}`,
      `License: ${license}`,
      ...(model.license?.url ? [`License URL: ${model.license.url}`] : []),
      ...(model.license?.requirements ? ["", `Requirements: ${model.license.requirements}`] : []),
      "",
      "You must keep this attribution with any resource built from this model.",
      "",
    ].join("\n");
    const licensePath = path.join(job.workDir, "LICENSE.txt");
    await writeFile(licensePath, licenseText);
    const zipPath = path.join(job.workDir, `${uid}.zip`);
    await createZip(zipPath, [
      { name: upload.originalName, file: glbPath },
      { name: "LICENSE.txt", file: licensePath },
    ]);

    let thumbnailPath: string | undefined;
    const rendered = await renderMeshThumbnail(loaded.meshes).catch(() => null);
    if (rendered) {
      thumbnailPath = path.join(job.workDir, "thumbnail.png");
      await writeFile(thumbnailPath, rendered);
    }

    await reporter.stage("complete", 99, "Done");
    return {
      ok: true,
      artifact: {
        localPath: zipPath,
        fileName: `${(model.name ?? uid).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 40)}.zip`,
        mime: "application/zip",
        thumbnailPath,
        previewPath: glbPath,
        manifest: {
          files: [{ path: upload.originalName, size: glb.length }, { path: "LICENSE.txt", size: licenseText.length }],
          stats: { triangles, materials: loaded.materials.length, bytes: glb.length },
          encoder: "native",
        },
      },
      facts: { uploadId: upload.id, license, author, sourceUrl, name: model.name ?? uid, triangles, cached: !!cached?.storageKey },
    };
  },

  async estimateCost(_input: AssetInput, ctx: ProcessorContext): Promise<CostEstimate> {
    return { credits: ctx.baseCost, breakdown: [{ label: "Sketchfab import", credits: ctx.baseCost }] };
  },
};
