import path from "node:path";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { AssetInput, AssetProcessor, CostEstimate, ProcessingJob, ProcessingResult, ProcessorContext, ValidationResult } from "@modsmith/core";
import { tattooConfigSchema } from "@modsmith/core";
import type { WorkerReporter } from "../lib/context";
import { ProcessingError } from "../lib/errors";
import { downloadInputs } from "../lib/inputs";
import { tattooManifest } from "../lib/manifest";
import { combineEncoders, encodeTextureDictionary, encoderReadmeNote, type EncoderKind } from "../lib/rage-convert";
import { buildReadme, createResourceBuilder } from "../lib/resource";
import { encodeDds, flatNormalDds, vramForTexture } from "../lib/textures";
import { escapeXml } from "../lib/xml";
import { frameworkFiles, frameworkInstallNotes, type TattooDefinition } from "../library/frameworks";

export type TattooZone = "head" | "torso" | "left_arm" | "right_arm" | "left_leg" | "right_leg";

export interface ZoneSpec {
  /** RAGE zone name used in the overlay XML. */
  zone: string;
  /** Overlay texture size. */
  size: number;
  /** UV rectangle the zone occupies on the ped texture (u, v, w, h in 0..1). */
  uv: [number, number, number, number];
}

export const ZONES: Record<TattooZone, ZoneSpec> = {
  head: { zone: "ZONE_HEAD", size: 512, uv: [0.25, 0.05, 0.5, 0.4] },
  torso: { zone: "ZONE_TORSO", size: 1024, uv: [0.1, 0.1, 0.8, 0.8] },
  left_arm: { zone: "ZONE_LEFT_ARM", size: 512, uv: [0.05, 0.15, 0.45, 0.7] },
  right_arm: { zone: "ZONE_RIGHT_ARM", size: 512, uv: [0.5, 0.15, 0.45, 0.7] },
  left_leg: { zone: "ZONE_LEFT_LEG", size: 512, uv: [0.05, 0.2, 0.45, 0.75] },
  right_leg: { zone: "ZONE_RIGHT_LEG", size: 512, uv: [0.5, 0.2, 0.45, 0.75] },
};

export interface OverlayEntry {
  id: string;
  name: string;
  collection: string;
  overlay: string;
  zone: string;
  gender: "male" | "female" | "both";
  uvPos: [number, number];
  scale: number;
  rotation: number;
  textureDict: string;
  textureName: string;
}

/** CodeWalker-compatible PedOverlay XML (`data_file 'PED_OVERLAY_FILE'`). */
export function buildOverlayXml(pack: string, entries: OverlayEntry[]): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<PedDecorationCollection>");
  lines.push(`  <presetName>${escapeXml(pack)}</presetName>`);
  lines.push("  <decorations>");
  for (const e of entries) {
    lines.push("    <Item>");
    lines.push(`      <collection>${escapeXml(e.collection)}</collection>`);
    lines.push(`      <preset>${escapeXml(e.overlay)}</preset>`);
    lines.push(`      <nameHash>${escapeXml(e.overlay)}</nameHash>`);
    lines.push(`      <txdHash>${escapeXml(e.textureDict)}</txdHash>`);
    lines.push(`      <txtHash>${escapeXml(e.textureName)}</txtHash>`);
    lines.push(`      <zone>${escapeXml(e.zone)}</zone>`);
    lines.push(`      <type>TYPE_TATTOO</type>`);
    lines.push(`      <faction>FM</faction>`);
    lines.push(`      <garment>All</garment>`);
    lines.push(`      <gender>${e.gender === "both" ? "GENDER_DONTCARE" : e.gender === "male" ? "GENDER_MALE" : "GENDER_FEMALE"}</gender>`);
    lines.push(`      <uvPos x="${e.uvPos[0].toFixed(4)}" y="${e.uvPos[1].toFixed(4)}" />`);
    lines.push(`      <scale x="${e.scale.toFixed(4)}" y="${e.scale.toFixed(4)}" />`);
    lines.push(`      <rotation value="${e.rotation.toFixed(2)}" />`);
    lines.push(`      <award />`);
    lines.push(`      <awardLevel>ALL</awardLevel>`);
    lines.push("    </Item>");
  }
  lines.push("  </decorations>");
  lines.push("</PedDecorationCollection>");
  return `${lines.join("\n")}\n`;
}

export const tattooProcessor: AssetProcessor = {
  name: "tattoo",

  async validate(input: AssetInput): Promise<ValidationResult> {
    const issues: ValidationResult["issues"] = [];
    const parsed = tattooConfigSchema.safeParse(input.config);
    if (!parsed.success) issues.push({ code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid tattoo configuration", severity: "error" });
    if (!input.files.length) issues.push({ code: "MISSING_INPUT", message: "Upload the tattoo artwork.", severity: "error" });
    return { ok: !issues.some((i) => i.severity === "error"), issues };
  },

  async process(job: ProcessingJob, ctx: ProcessorContext): Promise<ProcessingResult> {
    const reporter = job.reporter as WorkerReporter;
    const config = tattooConfigSchema.parse(job.input.config);
    const pack = config.packName;

    await reporter.stage("importing", 12, "Downloading artwork");
    const inputs = await downloadInputs(job.input, job.workDir, ctx.storage);
    const builder = await createResourceBuilder(pack, job.workDir);
    const encoders: EncoderKind[] = [];
    const warnings: string[] = [];
    const overlays: OverlayEntry[] = [];
    const definitions: TattooDefinition[] = [];
    const normalDds = await flatNormalDds(256);
    let thumbnailSource: Buffer | undefined;
    let vramBytes = 0;

    const ordered = [...config.tattoos].sort((a, b) => a.order - b.order);
    let done = 0;
    for (const tattoo of ordered) {
      const art = inputs.resolve(tattoo.imageKey);
      if (!art) throw new ProcessingError("MISSING_INPUT", `The artwork for "${tattoo.name}" was not part of this job's uploads.`);
      const spec = ZONES[tattoo.zone];
      await reporter.stage("textures", 20 + (done / ordered.length) * 55, `Rendering ${tattoo.name}`);

      // Place the artwork on a zone-sized transparent canvas at the requested position/scale.
      const drawSize = Math.max(8, Math.round(spec.size * 0.8 * tattoo.scale));
      let layer = sharp(art.file).resize(drawSize, drawSize, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha();
      if (tattoo.rotation) layer = layer.rotate(tattoo.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
      if (tattoo.opacity < 1) {
        const { data, info } = await layer.raw().toBuffer({ resolveWithObject: true });
        for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i]! * tattoo.opacity);
        layer = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
      }
      const layerPng = await layer.png().toBuffer();
      const layerMeta = await sharp(layerPng).metadata();
      const left = Math.round(spec.size / 2 - (layerMeta.width ?? drawSize) / 2 + tattoo.position[0] * spec.size);
      const top = Math.round(spec.size / 2 - (layerMeta.height ?? drawSize) / 2 + tattoo.position[1] * spec.size);
      const { data: canvas, info } = await sharp({ create: { width: spec.size, height: spec.size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: layerPng, left, top }])
        .raw()
        .toBuffer({ resolveWithObject: true });
      thumbnailSource ??= await sharp(canvas, { raw: { width: info.width, height: info.height, channels: 4 } }).flatten({ background: "#1a1c20" }).png().toBuffer();

      const id = tattoo.id.replace(/[^A-Za-z0-9_]+/g, "_").toLowerCase() || `tat_${done}`;
      const dictName = `${pack}_${id}`;
      const textureName = `${dictName}_diff`;
      const dds = await encodeDds({ width: info.width, height: info.height, data: canvas }, "DXT5", true);
      const encoded = await encodeTextureDictionary(
        [
          { name: textureName, dds },
          { name: `${dictName}_normal`, dds: normalDds },
        ],
        dictName,
        { workDir: job.workDir },
      );
      encoders.push(encoded.encoder);
      warnings.push(...encoded.warnings);
      for (const f of encoded.files) await builder.addFile(`stream/${f.name}`, f.content);
      vramBytes += vramForTexture(spec.size, spec.size, "DXT5", 1 + Math.log2(spec.size)) + vramForTexture(256, 256, "DXT5", 9);

      const overlay = `${pack}_${id}`.toUpperCase();
      overlays.push({
        id,
        name: tattoo.name,
        collection: pack,
        overlay,
        zone: spec.zone,
        gender: tattoo.gender,
        uvPos: [spec.uv[0] + spec.uv[2] / 2, spec.uv[1] + spec.uv[3] / 2],
        scale: tattoo.scale,
        rotation: tattoo.rotation,
        textureDict: dictName,
        textureName,
      });
      definitions.push({ id, name: tattoo.name, collection: pack, overlay, zone: spec.zone, gender: tattoo.gender });
      done++;
      reporter.assertNotCancelled();
    }

    await reporter.stage("packaging", 82, "Writing metadata");
    const overlayFile = `${pack}_overlay.xml`;
    await builder.addFile(overlayFile, buildOverlayXml(pack, overlays));

    const frameworkNotes: string[] = [];
    for (const framework of config.frameworks) {
      for (const file of frameworkFiles(framework, pack, definitions)) await builder.addFile(file.path, file.content);
      frameworkNotes.push(...frameworkInstallNotes(framework, pack));
    }

    await builder.addFile("fxmanifest.lua", tattooManifest({ resourceName: pack, overlayFile }));
    const encoder = combineEncoders(encoders);
    await builder.addFile(
      "INSTALL.md",
      [
        `# Installing ${pack}`,
        "",
        `1. Copy the \`${pack}\` folder into your server's \`resources\` directory.`,
        `2. Add \`ensure ${pack}\` to \`server.cfg\` — it must load before your tattoo shop resource.`,
        `3. Wire the pack into your framework:`,
        ...frameworkNotes.map((n) => `   - ${n}`),
        "",
        "## Overlay reference",
        "",
        "| Tattoo | Collection | Hash name | Zone | Gender |",
        "| --- | --- | --- | --- | --- |",
        ...overlays.map((o) => `| ${o.name} | ${o.collection} | ${o.overlay} | ${o.zone} | ${o.gender} |`),
        "",
        "Apply one in code with:",
        "",
        "```lua",
        `AddPedDecorationFromHashes(PlayerPedId(), GetHashKey('${pack}'), GetHashKey('${overlays[0]?.overlay ?? "OVERLAY"}'))`,
        "```",
        "",
      ].join("\n"),
    );
    await builder.addFile(
      "README.md",
      buildReadme({
        title: `${pack} — tattoo pack`,
        resourceName: pack,
        intro: `${overlays.length} tattoo overlay${overlays.length === 1 ? "" : "s"} with diffuse + normal textures and framework configs.`,
        usage: ["See INSTALL.md for framework wiring and the overlay hash reference."],
        warnings: encoder !== "native" ? [encoderReadmeNote(encoder, builder.xmlFallbacks)] : undefined,
        notes: [`Frameworks: ${config.frameworks.join(", ")}`, `Zones: ${[...new Set(overlays.map((o) => o.zone))].join(", ")}`],
      }),
    );

    const zipPath = path.join(job.workDir, `${pack}.zip`);
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
        fileName: `${pack}.zip`,
        mime: "application/zip",
        thumbnailPath,
        manifest: {
          files: builder.files,
          stats: { tattoos: overlays.length, textures: overlays.length * 2, vramBytes, frameworks: config.frameworks.length },
          encoder,
          warnings,
        },
      },
      facts: { pack, overlays: overlays.map((o) => ({ id: o.id, name: o.name, hash: o.overlay, zone: o.zone })), frameworks: config.frameworks },
    };
  },

  async estimateCost(input: AssetInput, ctx: ProcessorContext): Promise<CostEstimate> {
    const parsed = tattooConfigSchema.safeParse(input.config);
    const count = parsed.success ? parsed.data.tattoos.length : 1;
    const extra = Math.max(0, count - 1) * Math.ceil(ctx.baseCost * 0.15);
    return {
      credits: ctx.baseCost + extra,
      breakdown: [
        { label: "Tattoo pack export", credits: ctx.baseCost },
        ...(extra ? [{ label: `${count - 1} extra tattoo${count - 1 === 1 ? "" : "s"}`, credits: extra }] : []),
      ],
    };
  },
};
