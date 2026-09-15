import path from "node:path";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { AssetInput, AssetProcessor, CostEstimate, ProcessingJob, ProcessingResult, ProcessorContext, ValidationResult } from "@modsmith/core";
import { weaponSkinConfigSchema } from "@modsmith/core";
import type { WorkerReporter } from "../lib/context";
import { ProcessingError } from "../lib/errors";
import { downloadInputs } from "../lib/inputs";
import { weaponManifest } from "../lib/manifest";
import { combineEncoders, encodeTextureDictionary, encoderReadmeNote, type EncoderKind } from "../lib/rage-convert";
import { buildReadme, createResourceBuilder } from "../lib/resource";
import { encodeDds, toRgba, vramForTexture } from "../lib/textures";
import { findWeapon, WEAPONS } from "../library/weapons";

export const weaponProcessor: AssetProcessor = {
  name: "weapon",

  async validate(input: AssetInput): Promise<ValidationResult> {
    const issues: ValidationResult["issues"] = [];
    const parsed = weaponSkinConfigSchema.safeParse(input.config);
    if (!parsed.success) {
      issues.push({ code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid weapon skin configuration", severity: "error" });
      return { ok: false, issues };
    }
    for (const skin of parsed.data.skins) {
      if (!findWeapon(skin.weapon)) {
        issues.push({ code: "UNKNOWN_WEAPON", message: `"${skin.weapon}" is not a weapon we know. Pick one from the weapon list.`, severity: "error" });
      }
    }
    if (!input.files.length) issues.push({ code: "MISSING_INPUT", message: "Upload your skin designs.", severity: "error" });
    return { ok: !issues.some((i) => i.severity === "error"), issues, facts: { knownWeapons: WEAPONS.length } };
  },

  async process(job: ProcessingJob, ctx: ProcessorContext): Promise<ProcessingResult> {
    const reporter = job.reporter as WorkerReporter;
    const config = weaponSkinConfigSchema.parse(job.input.config);

    await reporter.stage("importing", 12, "Downloading your designs");
    const inputs = await downloadInputs(job.input, job.workDir, ctx.storage);
    const builder = await createResourceBuilder(config.resourceName, job.workDir);
    const encoders: EncoderKind[] = [];
    const warnings: string[] = [];
    const produced: { weapon: string; label: string; txd: string; texture: string; size: number }[] = [];
    let firstDesign: string | undefined;

    let done = 0;
    for (const skin of config.skins) {
      const weapon = findWeapon(skin.weapon);
      if (!weapon) throw new ProcessingError("UNKNOWN_WEAPON", `"${skin.weapon}" is not a weapon we know.`);
      const design = inputs.resolve(skin.textureKey);
      if (!design) throw new ProcessingError("MISSING_INPUT", `The design for ${weapon.label} was not part of this job's uploads.`);
      firstDesign ??= design.file;

      await reporter.stage("textures", 20 + (done / config.skins.length) * 55, `Encoding ${weapon.label}`);
      const rgba = await toRgba(design.file, { maxSize: 2048 });
      const dds = await encodeDds(rgba, "DXT5", true);
      const encoded = await encodeTextureDictionary([{ name: weapon.diffuse, dds }], weapon.txd, { workDir: job.workDir });
      encoders.push(encoded.encoder);
      warnings.push(...encoded.warnings);
      for (const f of encoded.files) await builder.addFile(`stream/${f.name}`, f.content);
      produced.push({ weapon: weapon.weapon, label: skin.name || weapon.label, txd: weapon.txd, texture: weapon.diffuse, size: rgba.width });
      done++;
      reporter.assertNotCancelled();
    }

    await reporter.stage("packaging", 85, "Packaging the resource");
    await builder.addFile("fxmanifest.lua", weaponManifest({ resourceName: config.resourceName, weaponCount: produced.length }));
    const encoder = combineEncoders(encoders);
    await builder.addFile(
      "README.md",
      buildReadme({
        title: `${config.resourceName} — weapon skins`,
        resourceName: config.resourceName,
        intro: `${produced.length} weapon skin${produced.length === 1 ? "" : "s"}. Each one replaces the weapon's texture dictionary through the stream folder — no meta edits needed.`,
        usage: [
          "Because these replace vanilla texture dictionaries, every player sees the skin on that weapon.",
          "To ship several looks for one weapon, build a separate resource per look and only ensure one at a time.",
        ],
        warnings: encoder !== "native" ? [encoderReadmeNote(encoder, builder.xmlFallbacks)] : undefined,
        notes: produced.map((p) => `${p.label}: ${p.weapon} → ${p.txd}.ytd (${p.texture}, ${p.size}²)`),
      }),
    );

    const zipPath = path.join(job.workDir, `${config.resourceName}.zip`);
    await builder.writeZip(zipPath);
    let thumbnailPath: string | undefined;
    if (firstDesign) {
      thumbnailPath = path.join(job.workDir, "thumbnail.png");
      await writeFile(thumbnailPath, await sharp(firstDesign).resize(512, 512, { fit: "cover" }).png().toBuffer());
    }

    await reporter.stage("complete", 99, "Done");
    return {
      ok: true,
      artifact: {
        localPath: zipPath,
        fileName: `${config.resourceName}.zip`,
        mime: "application/zip",
        thumbnailPath,
        manifest: {
          files: builder.files,
          stats: {
            skins: produced.length,
            textures: produced.length,
            vramBytes: produced.reduce((n, p) => n + vramForTexture(p.size, p.size, "DXT5", 1 + Math.log2(p.size)), 0),
          },
          encoder,
          warnings,
        },
      },
      facts: { skins: produced },
    };
  },

  async estimateCost(input: AssetInput, ctx: ProcessorContext): Promise<CostEstimate> {
    const parsed = weaponSkinConfigSchema.safeParse(input.config);
    const count = parsed.success ? parsed.data.skins.length : 1;
    const extra = Math.max(0, count - 1) * Math.ceil(ctx.baseCost * 0.2);
    return {
      credits: ctx.baseCost + extra,
      breakdown: [
        { label: "Weapon skin export", credits: ctx.baseCost },
        ...(extra ? [{ label: `${count - 1} extra skin${count - 1 === 1 ? "" : "s"}`, credits: extra }] : []),
      ],
    };
  },
};
