import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { AssetInput, AssetProcessor, CostEstimate, ProcessingJob, ProcessingResult, ProcessorContext, ValidationResult } from "@modsmith/core";
import { liveryConfigSchema } from "@modsmith/core";
import type { WorkerReporter } from "../lib/context";
import { ProcessingError } from "../lib/errors";
import { downloadInputs } from "../lib/inputs";
import { vehicleManifest } from "../lib/manifest";
import { combineEncoders, encodeTextureDictionary, encoderReadmeNote } from "../lib/rage-convert";
import { buildReadme, createResourceBuilder } from "../lib/resource";
import { readStaged, stageResource, streamPath } from "../lib/stage";
import { encodeDds, readYtdTextures, toRgba, vramForTexture } from "../lib/textures";

/** Pick the texture slot a livery should overwrite. */
export function pickLiveryTexture(names: string[], vehicleName: string, liveryName: string): string {
  const preferred = names.find((n) => /sign_?1|livery|_liv|decal/i.test(n));
  if (preferred) return preferred;
  const body = names.find((n) => /body|paint|_1$/i.test(n));
  if (body) return body;
  return `${vehicleName}_sign_1`;
}

export const liveryProcessor: AssetProcessor = {
  name: "livery",

  async validate(input: AssetInput): Promise<ValidationResult> {
    const issues: ValidationResult["issues"] = [];
    const parsed = liveryConfigSchema.safeParse(input.config);
    if (!parsed.success) {
      issues.push({ code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid livery configuration", severity: "error" });
    }
    if (!input.files.length) issues.push({ code: "MISSING_INPUT", message: "Upload the vehicle files and your livery design.", severity: "error" });
    return { ok: !issues.some((i) => i.severity === "error"), issues };
  },

  async process(job: ProcessingJob, ctx: ProcessorContext): Promise<ProcessingResult> {
    const reporter = job.reporter as WorkerReporter;
    const config = liveryConfigSchema.parse(job.input.config);
    const resolution = Number(config.resolution);

    await reporter.stage("importing", 12, "Downloading the vehicle");
    const inputs = await downloadInputs(job.input, job.workDir, ctx.storage);
    const design = inputs.resolve(config.textureKey) ?? inputs.first("png", "jpg", "jpeg", "webp");
    if (!design) throw new ProcessingError("MISSING_INPUT", "The baked livery image was not part of this job's uploads.");
    const staged = await stageResource({ files: inputs.files.filter((f) => f !== design) }, job.workDir);
    reporter.assertNotCancelled();

    const ytds = staged.byExt("ytd");
    const yfts = staged.byExt("yft");
    if (!ytds.length) throw new ProcessingError("MISSING_INPUT", "No .ytd texture dictionary was found — upload the vehicle's texture file so the livery can be baked into it.");

    await reporter.stage("textures", 45, "Baking the livery");
    const target = ytds[0]!;
    const existing = await readYtdTextures(await readStaged(target));
    const names = existing.map((t) => t.name);
    const slot = pickLiveryTexture(names, config.vehicleName, config.liveryName);
    const baked = await toRgba(design.file, { forceSize: resolution });
    const dds = await encodeDds(baked, "DXT5", true);

    const rebuilt: { name: string; dds: Buffer }[] = [];
    let replaced = false;
    for (const t of existing) {
      if (t.name === slot) {
        rebuilt.push({ name: t.name, dds });
        replaced = true;
      } else {
        rebuilt.push({ name: t.name, dds: t.dds() });
      }
    }
    if (!replaced) rebuilt.push({ name: slot, dds });
    reporter.assertNotCancelled();

    await reporter.stage("converting", 70, "Rebuilding the texture dictionary");
    const resourceName = `${config.vehicleName}_${config.liveryName}`.replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
    const builder = await createResourceBuilder(resourceName, job.workDir);
    const ytdName = path.parse(target.rel).name;
    const encoded = await encodeTextureDictionary(rebuilt, ytdName, { workDir: job.workDir });
    for (const f of encoded.files) await builder.addFile(`stream/${f.name}`, f.content);

    // The model itself is never touched — copy it verbatim so nothing about the vehicle changes.
    for (const yft of yfts) await builder.addLocal(streamPath(staged, yft), yft.abs);
    for (const other of staged.files) {
      if (other === target || yfts.includes(other)) continue;
      if (["ytd", "yft", "ydr", "ydd", "ybn"].includes(other.ext)) await builder.addLocal(streamPath(staged, other), other.abs);
    }

    await reporter.stage("packaging", 86, "Packaging the resource");
    await builder.addFile("fxmanifest.lua", vehicleManifest({ resourceName }));
    const encoder = combineEncoders([encoded.encoder]);
    await builder.addFile(
      "README.md",
      buildReadme({
        title: `${resourceName} — livery`,
        resourceName,
        intro: `Your livery baked into \`${slot}\` of ${config.vehicleName}'s texture dictionary at ${resolution}².`,
        usage: [
          `This resource replaces the vehicle's texture dictionary. Load it after the vehicle resource (\`ensure ${resourceName}\` below the car in server.cfg).`,
          replaced ? `Existing texture \`${slot}\` was replaced.` : `Texture \`${slot}\` was added to the dictionary — set the livery in-game with \`SetVehicleLivery\` or a mod-shop menu.`,
        ],
        warnings: encoder !== "native" ? [encoderReadmeNote(encoder, builder.xmlFallbacks)] : undefined,
        notes: [`Textures in dictionary: ${rebuilt.length}`, `Livery resolution: ${resolution}×${resolution} (DXT5, mipmapped)`],
      }),
    );

    const zipPath = path.join(job.workDir, `${resourceName}.zip`);
    await builder.writeZip(zipPath);
    const thumbnailPath = path.join(job.workDir, "thumbnail.png");
    await writeFile(thumbnailPath, await sharp(await readFile(design.file)).resize(512, 512, { fit: "cover" }).png().toBuffer());

    await reporter.stage("complete", 99, "Done");
    return {
      ok: true,
      artifact: {
        localPath: zipPath,
        fileName: `${resourceName}.zip`,
        mime: "application/zip",
        thumbnailPath,
        manifest: {
          files: builder.files,
          stats: { textures: rebuilt.length, liveryTexture: slot, resolution, vramBytes: vramForTexture(resolution, resolution, "DXT5", 1 + Math.log2(resolution)) },
          encoder,
          warnings: encoded.warnings,
        },
      },
      facts: { vehicleName: config.vehicleName, liveryName: config.liveryName, textureSlot: slot, replacedExisting: replaced },
    };
  },

  async estimateCost(_input: AssetInput, ctx: ProcessorContext): Promise<CostEstimate> {
    return { credits: ctx.baseCost, breakdown: [{ label: "Livery export", credits: ctx.baseCost }] };
  },
};
