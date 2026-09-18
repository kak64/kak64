import path from "node:path";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { AssetInput, AssetProcessor, CostEstimate, ProcessingJob, ProcessingResult, ProcessorContext, ValidationResult } from "@modsmith/core";
import { clothingConfigSchema } from "@modsmith/core";
import type { WorkerReporter } from "../lib/context";
import { ProcessingError } from "../lib/errors";
import { downloadInputs } from "../lib/inputs";
import { clothingManifest } from "../lib/manifest";
import { combineEncoders, encodeTextureDictionary, encoderReadmeNote, type EncoderKind } from "../lib/rage-convert";
import { buildReadme, createResourceBuilder } from "../lib/resource";
import { stageResource } from "../lib/stage";
import { encodeDds, toRgba, vramForTexture } from "../lib/textures";
import { escapeXml } from "../lib/xml";
import { componentPrefix, findGarment } from "../library/garments";

const VARIANT_LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Add-on clothing metadata (the .ymt equivalent CodeWalker imports). */
export function buildComponentYmtXml(opts: { resourceName: string; gender: "male" | "female"; prefix: string; drawableIndex: number; variants: string[] }): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<CPedVariationInfo>");
  lines.push(`  <name>${escapeXml(opts.resourceName)}</name>`);
  lines.push(`  <gender>${opts.gender === "male" ? "GENDER_MALE" : "GENDER_FEMALE"}</gender>`);
  lines.push("  <availComp>");
  lines.push(`    <Item>${escapeXml(opts.prefix)}</Item>`);
  lines.push("  </availComp>");
  lines.push("  <aComponentData3>");
  lines.push("    <Item>");
  lines.push(`      <numAvailTex value="${opts.variants.length}" />`);
  lines.push(`      <drawableIndex value="${opts.drawableIndex}" />`);
  lines.push("      <aTexData>");
  for (let i = 0; i < opts.variants.length; i++) {
    lines.push("        <Item>");
    lines.push(`          <texId value="${i}" />`);
    lines.push(`          <name>${escapeXml(opts.variants[i]!)}</name>`);
    lines.push("          <distribution value=\"255\" />");
    lines.push("        </Item>");
  }
  lines.push("      </aTexData>");
  lines.push("    </Item>");
  lines.push("  </aComponentData3>");
  lines.push("</CPedVariationInfo>");
  return `${lines.join("\n")}\n`;
}

export const clothingProcessor: AssetProcessor = {
  name: "clothing",

  async validate(input: AssetInput): Promise<ValidationResult> {
    const issues: ValidationResult["issues"] = [];
    const parsed = clothingConfigSchema.safeParse(input.config);
    if (!parsed.success) {
      issues.push({ code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid clothing configuration", severity: "error" });
      return { ok: false, issues };
    }
    if (parsed.data.garmentSource === "library" && !parsed.data.garmentId) {
      issues.push({ code: "MISSING_GARMENT", message: "Pick a garment from the library.", severity: "error" });
    }
    if (parsed.data.garmentSource === "library" && parsed.data.garmentId && !findGarment(parsed.data.garmentId)) {
      issues.push({ code: "UNKNOWN_GARMENT", message: `"${parsed.data.garmentId}" is not in the garment library.`, severity: "error" });
    }
    if (!input.files.length) issues.push({ code: "MISSING_INPUT", message: "Upload at least one variant texture.", severity: "error" });
    return { ok: !issues.some((i) => i.severity === "error"), issues };
  },

  async process(job: ProcessingJob, ctx: ProcessorContext): Promise<ProcessingResult> {
    const reporter = job.reporter as WorkerReporter;
    const config = clothingConfigSchema.parse(job.input.config);
    const resource = config.resourceName;

    await reporter.stage("importing", 12, "Downloading your files");
    const inputs = await downloadInputs(job.input, job.workDir, ctx.storage);
    const variantFiles = new Set(config.variants.map((v) => inputs.resolve(v.textureKey)?.file).filter(Boolean) as string[]);
    const garmentInputs = inputs.files.filter((f) => !variantFiles.has(f.file));

    const garment = config.garmentId ? findGarment(config.garmentId) : undefined;
    const prefix = componentPrefix(garment?.component ?? config.component);
    const genderTag = config.gender === "male" ? "mp_m_freemode_01" : "mp_f_freemode_01";
    const builder = await createResourceBuilder(resource, job.workDir);
    const warnings: string[] = [];
    const encoders: EncoderKind[] = [];

    // Garment mesh: uploaded .ydd/.zip is copied verbatim; library entries reference the
    // player's own game files (base-game meshes are not redistributable).
    let yddName: string | null = null;
    if (config.garmentSource === "upload") {
      if (!garmentInputs.length) throw new ProcessingError("MISSING_INPUT", "Upload the garment .ydd (or a ZIP containing it).");
      const staged = await stageResource({ files: garmentInputs }, job.workDir);
      const ydd = staged.byExt("ydd")[0];
      if (!ydd) throw new ProcessingError("MISSING_INPUT", "No .ydd garment mesh was found in the upload.");
      yddName = `${prefix}_000_u`;
      await builder.addLocal(`stream/${yddName}.ydd`, ydd.abs);
      for (const extra of staged.byExt("ytd")) {
        if (/_diff_/i.test(extra.rel)) continue;
        await builder.addLocal(`stream/${path.posix.basename(extra.rel)}`, extra.abs);
      }
    } else {
      warnings.push(
        `Library garment "${garment?.label ?? config.garmentId}" ships textures only. Copy the matching drawable (${garment?.sourceHint ?? "the base-game .ydd"}) from your own game files into stream/ as ${prefix}_000_u.ydd — we cannot redistribute base-game meshes.`,
      );
    }

    await reporter.stage("textures", 40, "Encoding variant textures");
    const variantNames: string[] = [];
    let thumbnailSource: string | undefined;
    let vramBytes = 0;
    for (let i = 0; i < config.variants.length; i++) {
      const variant = config.variants[i]!;
      const source = inputs.resolve(variant.textureKey);
      if (!source) throw new ProcessingError("MISSING_INPUT", `The texture for variant "${variant.name}" was not part of this job's uploads.`);
      thumbnailSource ??= source.file;
      const letter = VARIANT_LETTERS[i] ?? `z${i}`;
      const name = `${prefix}_diff_000_${letter}_uni`;
      const rgba = await toRgba(source.file, { maxSize: garment?.textureSize ?? 2048 });
      const dds = await encodeDds(rgba, "DXT5", true);
      const encoded = await encodeTextureDictionary([{ name, dds }], name, { workDir: job.workDir });
      encoders.push(encoded.encoder);
      warnings.push(...encoded.warnings);
      for (const f of encoded.files) await builder.addFile(`stream/${f.name}`, f.content);
      variantNames.push(name);
      vramBytes += vramForTexture(rgba.width, rgba.height, "DXT5", 1 + Math.log2(Math.max(rgba.width, rgba.height)));
      await reporter.stage("textures", 40 + ((i + 1) / config.variants.length) * 35, `Variant ${variant.name}`);
      reporter.assertNotCancelled();
    }

    await reporter.stage("packaging", 84, "Writing metadata");
    const ymtFile = `${genderTag}_${prefix}.ymt.xml`;
    await builder.addFile(ymtFile, buildComponentYmtXml({ resourceName: resource, gender: config.gender, prefix, drawableIndex: 0, variants: variantNames }));
    await builder.addFile("fxmanifest.lua", clothingManifest({ resourceName: resource, metaFiles: [ymtFile] }));
    const encoder = combineEncoders(encoders);
    await builder.addFile(
      "README.md",
      buildReadme({
        title: `${resource} — add-on clothing`,
        resourceName: resource,
        intro: `${variantNames.length} texture variant${variantNames.length === 1 ? "" : "s"} for the ${config.gender} freemode ped, component \`${prefix}\`.`,
        usage: [
          "Add-on clothing needs a clothing manager (illenium-appearance, qb-clothing, fivem-appearance…) that reads add-on component packs; point it at this resource name.",
          `Variant textures are named \`${variantNames[0] ?? `${prefix}_diff_000_a_uni`}\` … change the letter suffix to switch variant.`,
        ],
        warnings: [
          ...(encoder !== "native" ? [encoderReadmeNote(encoder, builder.xmlFallbacks)] : []),
          `FiveM has no \`data_file\` type for add-on \`.ymt\` component metadata — \`${ymtFile}\` is provided for CodeWalker/OpenIV import and for clothing managers that read component packs directly.`,
          ...(config.garmentSource === "library" ? [`This pack contains textures only; add the garment drawable yourself (see notes).`] : []),
        ],
        notes: [
          ...(garment ? [`Library garment: ${garment.label} (${garment.component}, slot ${garment.componentId})`, `Source drawable: ${garment.sourceHint}`] : []),
          ...(yddName ? [`Garment drawable: stream/${yddName}.ydd`] : []),
        ],
      }),
    );

    const zipPath = path.join(job.workDir, `${resource}.zip`);
    await builder.writeZip(zipPath);
    let thumbnailPath: string | undefined;
    if (thumbnailSource) {
      thumbnailPath = path.join(job.workDir, "thumbnail.png");
      await writeFile(thumbnailPath, await sharp(thumbnailSource).resize(512, 512, { fit: "cover" }).png().toBuffer());
    }

    await reporter.stage("complete", 99, "Done");
    return {
      ok: true,
      artifact: {
        localPath: zipPath,
        fileName: `${resource}.zip`,
        mime: "application/zip",
        thumbnailPath,
        manifest: {
          files: builder.files,
          stats: { variants: variantNames.length, textures: variantNames.length, vramBytes, component: prefix },
          encoder,
          warnings,
        },
      },
      facts: { resource, gender: config.gender, component: prefix, variants: variantNames, garmentSource: config.garmentSource, garmentId: config.garmentId ?? null },
    };
  },

  async estimateCost(input: AssetInput, ctx: ProcessorContext): Promise<CostEstimate> {
    const parsed = clothingConfigSchema.safeParse(input.config);
    const count = parsed.success ? parsed.data.variants.length : 1;
    const extra = Math.max(0, count - 1) * Math.ceil(ctx.baseCost * 0.1);
    return {
      credits: ctx.baseCost + extra,
      breakdown: [
        { label: "Clothing export", credits: ctx.baseCost },
        ...(extra ? [{ label: `${count - 1} extra variant${count - 1 === 1 ? "" : "s"}`, credits: extra }] : []),
      ],
    };
  },
};
