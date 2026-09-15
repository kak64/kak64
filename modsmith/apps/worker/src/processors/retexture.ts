import path from "node:path";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { AssetInput, AssetProcessor, CostEstimate, ProcessingJob, ProcessingResult, ProcessorContext, ValidationResult } from "@modsmith/core";
import { retextureConfigSchema } from "@modsmith/core";
import type { WorkerReporter } from "../lib/context";
import { ProcessingError } from "../lib/errors";
import { downloadInputs } from "../lib/inputs";
import { buildFxManifest } from "../lib/manifest";
import { combineEncoders, encodeTextureDictionary, encoderReadmeNote, type EncoderKind } from "../lib/rage-convert";
import { buildReadme, createResourceBuilder } from "../lib/resource";
import { readStaged, stageResource, streamPath } from "../lib/stage";
import { encodeDds, placeImage, readYtdTextures, rgbaToPng, vramForTexture, type RgbaImage } from "../lib/textures";

export const retextureProcessor: AssetProcessor = {
  name: "retexture",

  async validate(input: AssetInput): Promise<ValidationResult> {
    const issues: ValidationResult["issues"] = [];
    const parsed = retextureConfigSchema.safeParse(input.config);
    if (!parsed.success) issues.push({ code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid retexture configuration", severity: "error" });
    if (!input.files.length) issues.push({ code: "MISSING_INPUT", message: "Upload the resource and your replacement images.", severity: "error" });
    return { ok: !issues.some((i) => i.severity === "error"), issues };
  },

  async process(job: ProcessingJob, ctx: ProcessorContext): Promise<ProcessingResult> {
    const reporter = job.reporter as WorkerReporter;
    const config = retextureConfigSchema.parse(job.input.config);

    await reporter.stage("importing", 12, "Downloading the resource");
    const inputs = await downloadInputs(job.input, job.workDir, ctx.storage);
    const replacementFiles = new Set(config.replacements.map((r) => inputs.resolve(r.replacementKey)?.file).filter(Boolean) as string[]);
    const staged = await stageResource({ files: inputs.files.filter((f) => !replacementFiles.has(f.file)) }, job.workDir);
    reporter.assertNotCancelled();

    const ytds = staged.byExt("ytd");
    if (!ytds.length) throw new ProcessingError("MISSING_INPUT", "No .ytd texture dictionary was found in the upload — the textures to replace live inside one.");

    const resourceName = `${path.parse(ytds[0]!.rel).name}_retex`.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const builder = await createResourceBuilder(resourceName, job.workDir);
    const encoders: EncoderKind[] = [];
    const warnings: string[] = [];
    const applied: { material: string; texture: string; width: number; height: number }[] = [];
    const unmatched: string[] = [];
    let previewImage: RgbaImage | null = null;

    await reporter.stage("textures", 40, "Applying replacements");
    let index = 0;
    for (const ytd of ytds) {
      const textures = await readYtdTextures(await readStaged(ytd));
      if (!textures.length) {
        await builder.addLocal(streamPath(staged, ytd), ytd.abs);
        warnings.push(`${path.basename(ytd.rel)} could not be read and was copied unchanged.`);
        continue;
      }
      const rebuilt: { name: string; dds: Buffer }[] = [];
      let touched = false;
      for (const t of textures) {
        const replacement = config.replacements.find((r) => r.texture === t.name || r.material === t.name);
        if (!replacement) {
          rebuilt.push({ name: t.name, dds: t.dds() });
          continue;
        }
        const source = inputs.resolve(replacement.replacementKey);
        if (!source) {
          unmatched.push(replacement.texture);
          rebuilt.push({ name: t.name, dds: t.dds() });
          continue;
        }
        const placed = await placeImage(source.file, { width: t.width, height: t.height }, replacement.transform, replacement.adjustments);
        let alpha = false;
        for (let i = 3; i < placed.data.length; i += 4) {
          if (placed.data[i]! < 250) {
            alpha = true;
            break;
          }
        }
        rebuilt.push({ name: t.name, dds: await encodeDds(placed, alpha ? "DXT5" : "DXT1", true) });
        applied.push({ material: replacement.material, texture: t.name, width: t.width, height: t.height });
        previewImage ??= placed;
        touched = true;
        reporter.assertNotCancelled();
      }
      if (!touched) {
        await builder.addLocal(streamPath(staged, ytd), ytd.abs);
        continue;
      }
      const encoded = await encodeTextureDictionary(rebuilt, path.parse(ytd.rel).name, { workDir: job.workDir });
      encoders.push(encoded.encoder);
      warnings.push(...encoded.warnings);
      for (const f of encoded.files) await builder.addFile(`stream/${f.name}`, f.content);
      index++;
      await reporter.stage("textures", 40 + Math.min(35, (index / ytds.length) * 35), "Rebuilding texture dictionaries");
    }

    if (!applied.length) {
      throw new ProcessingError(
        "NO_MATCHING_TEXTURE",
        `None of the selected textures were found in the uploaded files (${config.replacements.map((r) => r.texture).join(", ")}). Re-open the resource in the editor and pick the surface again.`,
      );
    }
    for (const t of unmatched) warnings.push(`No replacement image was uploaded for ${t}; the original texture was kept.`);

    // Everything else (models, collisions, metadata, scripts) is copied byte-for-byte.
    for (const f of staged.files) {
      if (ytds.includes(f)) continue;
      if (builder.has(streamPath(staged, f))) continue;
      if (["ydr", "yft", "ydd", "ybn", "ytyp"].includes(f.ext)) await builder.addLocal(streamPath(staged, f), f.abs);
      else if (!/fxmanifest\.lua|__resource\.lua|readme/i.test(f.rel)) await builder.addLocal(f.rel, f.abs);
    }

    await reporter.stage("packaging", 86, "Packaging the resource");
    await builder.addFile("fxmanifest.lua", buildFxManifest({ name: resourceName, description: `Retextured ${path.parse(ytds[0]!.rel).name} — built with Modsmith` }));
    const encoder = combineEncoders(encoders);
    await builder.addFile(
      "README.md",
      buildReadme({
        title: `${resourceName} — retexture`,
        resourceName,
        intro: `${applied.length} texture${applied.length === 1 ? "" : "s"} replaced in ${ytds.length} dictionar${ytds.length === 1 ? "y" : "ies"}. Geometry and metadata are untouched.`,
        usage: [`Stream this resource after the original one so its textures win.`],
        warnings: encoder !== "native" ? [encoderReadmeNote(encoder, builder.xmlFallbacks)] : undefined,
        notes: applied.map((a) => `${a.material} → ${a.texture} (${a.width}×${a.height})`),
      }),
    );

    const zipPath = path.join(job.workDir, `${resourceName}.zip`);
    await builder.writeZip(zipPath);
    let thumbnailPath: string | undefined;
    if (previewImage) {
      thumbnailPath = path.join(job.workDir, "thumbnail.png");
      await writeFile(thumbnailPath, await sharp(await rgbaToPng(previewImage)).resize(512, 512, { fit: "cover" }).png().toBuffer());
    }

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
          stats: {
            textures: applied.length,
            dictionaries: ytds.length,
            vramBytes: applied.reduce((n, a) => n + vramForTexture(a.width, a.height, "DXT5", 1), 0),
          },
          encoder,
          warnings,
        },
      },
      facts: { replaced: applied, unmatched },
    };
  },

  async estimateCost(_input: AssetInput, ctx: ProcessorContext): Promise<CostEstimate> {
    return { credits: ctx.baseCost, breakdown: [{ label: "Retexture export", credits: ctx.baseCost }] };
  },
};
