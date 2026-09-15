import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AssetInput, AssetProcessor, CostEstimate, ProcessingJob, ProcessingResult, ProcessorContext, ValidationResult } from "@modsmith/core";
import { aiPropConfigSchema, LIMITS } from "@modsmith/core";
import { prisma } from "@modsmith/db";
import { storage } from "@modsmith/services";
import { createProvider } from "../ai/provider";
import type { WorkerReporter } from "../lib/context";
import { ProcessingError } from "../lib/errors";
import { sha256Buffer } from "../lib/files";
import { loadModel } from "../lib/gltf";
import { downloadInputs } from "../lib/inputs";
import { triangleCount } from "../lib/mesh";
import { renderMeshThumbnail, textureThumbnail } from "../lib/thumbnail";
import { createZip } from "../lib/zip";

export const aiPropProcessor: AssetProcessor = {
  name: "ai-prop",

  async validate(input: AssetInput): Promise<ValidationResult> {
    const issues: ValidationResult["issues"] = [];
    const hasImage = input.files.some((f) => /\.(png|jpe?g|webp)$/i.test(f.originalName ?? f.key));
    if (!hasImage) issues.push({ code: "MISSING_INPUT", message: "Upload a photo (PNG, JPG or WEBP) of the object you want modelled.", severity: "error" });
    const parsed = aiPropConfigSchema.safeParse(input.config);
    if (!parsed.success) issues.push({ code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid configuration", severity: "error" });
    return { ok: !issues.some((i) => i.severity === "error"), issues };
  },

  async process(job: ProcessingJob, ctx: ProcessorContext): Promise<ProcessingResult> {
    const reporter = job.reporter as WorkerReporter;
    const config = aiPropConfigSchema.parse(job.input.config);

    await reporter.stage("importing", 10, "Downloading your photo");
    const inputs = await downloadInputs(job.input, job.workDir, ctx.storage);
    const photo = inputs.first("png", "jpg", "jpeg", "webp");
    if (!photo) throw new ProcessingError("MISSING_INPUT", "Upload a photo of the object you want modelled.");
    reporter.assertNotCancelled();

    const provider = createProvider();
    await reporter.stage("converting", 20, `Generating geometry (${provider.name})`);
    const generated = await provider.generate(photo.file, {
      workDir: job.workDir,
      prompt: config.prompt,
      quality: config.quality,
      onProgress: (fraction, message) => {
        void reporter.stage("converting", 20 + fraction * 50, message ?? "Generating geometry");
      },
    });
    reporter.assertNotCancelled();

    await reporter.stage("optimizing", 74, "Checking the generated mesh");
    const glbBuffer = await readFile(generated.glbPath);
    const loaded = await loadModel(generated.glbPath);
    const triangles = triangleCount(loaded.meshes);
    if (!triangles) throw new ProcessingError("AI_GENERATION_FAILED", "The generated model contained no geometry.");
    await reporter.log(`Generated ${triangles} triangles, ${loaded.materials.length} materials`);

    // Store the GLB as a new upload so the Prop Creator can open it without a re-upload.
    const sha256 = sha256Buffer(glbBuffer);
    const upload = await prisma.assetUpload.create({
      data: {
        userId: job.userId,
        toolSlug: "prop-creator",
        originalName: `${path.parse(photo.name).name || "ai-prop"}.glb`,
        storageKey: `ai/${job.userId}/${job.id}/model.glb`,
        sizeBytes: BigInt(glbBuffer.length),
        declaredMime: "model/gltf-binary",
        detectedMime: "model/gltf-binary",
        sha256,
        status: "UPLOADED",
        scanStatus: "skipped",
        expiresAt: new Date(Date.now() + LIMITS.UPLOAD_TTL_HOURS * 3_600_000),
      },
    });
    await storage().putObject(upload.storageKey, glbBuffer, "model/gltf-binary");

    await reporter.stage("packaging", 88, "Packaging the download");
    const previewPath = path.join(job.workDir, "preview.glb");
    await writeFile(previewPath, glbBuffer);
    const zipFiles = [{ name: `${upload.originalName}`, file: generated.glbPath }];
    let thumbnailPath: string | undefined;
    const rendered = await renderMeshThumbnail(loaded.meshes).catch(() => null);
    if (rendered) {
      thumbnailPath = path.join(job.workDir, "thumbnail.png");
      await writeFile(thumbnailPath, rendered);
    } else if (generated.previewPngPath) {
      thumbnailPath = generated.previewPngPath;
    } else {
      thumbnailPath = path.join(job.workDir, "thumbnail.png");
      await writeFile(thumbnailPath, await textureThumbnail(photo.file));
    }
    // Ship the extracted textures next to the GLB so the model is usable outside Modsmith too.
    for (const material of loaded.materials) {
      for (const slot of [material.diffuse, material.normal, material.specular]) {
        if (slot?.file) zipFiles.push({ name: `textures/${path.basename(slot.file)}`, file: slot.file });
      }
    }
    const zipPath = path.join(job.workDir, "ai-prop.zip");
    await createZip(zipPath, zipFiles);

    await reporter.stage("complete", 99, "Done");
    return {
      ok: true,
      artifact: {
        localPath: zipPath,
        fileName: "ai-prop.zip",
        mime: "application/zip",
        thumbnailPath,
        previewPath,
        manifest: {
          files: zipFiles.map((f) => ({ path: f.name, size: 0 })),
          stats: { triangles, materials: loaded.materials.length, provider: provider.name, quality: config.quality },
          encoder: "native",
          facts: { uploadId: upload.id },
        },
      },
      facts: {
        uploadId: upload.id,
        provider: provider.name,
        externalId: generated.externalId ?? null,
        triangles,
        preview: { uploadId: upload.id, storageKey: upload.storageKey, sha256 },
      },
    };
  },

  async estimateCost(input: AssetInput, ctx: ProcessorContext): Promise<CostEstimate> {
    const parsed = aiPropConfigSchema.safeParse(input.config);
    const quality = parsed.success ? parsed.data.quality : "standard";
    const multiplier = quality === "high" ? 1.5 : quality === "draft" ? 0.6 : 1;
    const credits = Math.max(1, Math.ceil(ctx.baseCost * multiplier));
    return {
      credits,
      breakdown: [
        { label: "AI generation", credits: Math.ceil(ctx.baseCost * multiplier) },
      ],
    };
  },
};
