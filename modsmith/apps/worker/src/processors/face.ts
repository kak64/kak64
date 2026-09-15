import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { AssetInput, AssetProcessor, CostEstimate, ProcessingJob, ProcessingResult, ProcessorContext, ValidationResult } from "@modsmith/core";
import { faceConfigSchema } from "@modsmith/core";
import type { WorkerReporter } from "../lib/context";
import { ProcessingError } from "../lib/errors";
import { downloadInputs } from "../lib/inputs";
import { faceManifest } from "../lib/manifest";
import { buildReadme, createResourceBuilder } from "../lib/resource";
import { encodeDds, type RgbaImage } from "../lib/textures";
import { combineEncoders, encodeTextureDictionary, encoderReadmeNote } from "../lib/rage-convert";

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlignedFace {
  png: Buffer;
  box: FaceBox;
  size: number;
  method: "skin-detection" | "center-crop";
}

/** Classic RGB skin-tone rule (Kovac et al.) — cheap, no model files, good enough to centre a crop. */
export function isSkinPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return r > 95 && g > 40 && b > 20 && max - min > 15 && Math.abs(r - g) > 15 && r > g && r > b;
}

/**
 * Find the largest skin-coloured blob and return a square crop around it.
 * Falls back to a centred square crop when no convincing region is found.
 */
export async function alignFace(input: Buffer, outSize = 1024): Promise<AlignedFace> {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new ProcessingError("INVALID_IMAGE", "The uploaded photo could not be read.");

  const sw = 128;
  const sh = Math.max(1, Math.round((height / width) * sw));
  const { data } = await sharp(input).resize(sw, sh, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(sw * sh);
  let skinCount = 0;
  for (let i = 0; i < sw * sh; i++) {
    if (isSkinPixel(data[i * 3]!, data[i * 3 + 1]!, data[i * 3 + 2]!)) {
      mask[i] = 1;
      skinCount++;
    }
  }

  let box: FaceBox | null = null;
  let method: AlignedFace["method"] = "center-crop";
  if (skinCount > sw * sh * 0.02) {
    // Largest 4-connected component via iterative flood fill.
    const seen = new Uint8Array(sw * sh);
    let best = { size: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const stack: number[] = [];
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || seen[start]) continue;
      stack.length = 0;
      stack.push(start);
      seen[start] = 1;
      let size = 0;
      let minX = sw, minY = sh, maxX = 0, maxY = 0;
      while (stack.length) {
        const idx = stack.pop()!;
        const x = idx % sw;
        const y = (idx - x) / sw;
        size++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        const neighbours = [x > 0 ? idx - 1 : -1, x < sw - 1 ? idx + 1 : -1, y > 0 ? idx - sw : -1, y < sh - 1 ? idx + sw : -1];
        for (const n of neighbours) {
          if (n < 0 || seen[n] || !mask[n]) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
      if (size > best.size) best = { size, minX, minY, maxX, maxY };
    }
    if (best.size > sw * sh * 0.01) {
      const scaleX = width / sw;
      const scaleY = height / sh;
      const cx = ((best.minX + best.maxX) / 2) * scaleX;
      const cy = ((best.minY + best.maxY) / 2) * scaleY;
      const side = Math.max((best.maxX - best.minX) * scaleX, (best.maxY - best.minY) * scaleY) * 1.5;
      const half = Math.max(32, side / 2);
      box = {
        x: Math.max(0, Math.round(cx - half)),
        y: Math.max(0, Math.round(cy - half)),
        width: Math.round(Math.min(width, half * 2)),
        height: Math.round(Math.min(height, half * 2)),
      };
      method = "skin-detection";
    }
  }
  if (!box) {
    const side = Math.min(width, height);
    box = { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), width: side, height: side };
  }
  box.width = Math.min(box.width, width - box.x);
  box.height = Math.min(box.height, height - box.y);
  const png = await sharp(input).extract({ left: box.x, top: box.y, width: Math.max(8, box.width), height: Math.max(8, box.height) }).resize(outSize, outSize, { fit: "cover" }).png().toBuffer();
  return { png, box, size: outSize, method };
}

/** Procedural head-diffuse base: a soft vertical skin gradient with subtle shading. */
export async function skinTemplate(size: number, tone: [number, number, number] = [214, 176, 152]): Promise<RgbaImage> {
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    // Slightly darker towards the bottom (jaw/neck) and edges.
    const vertical = 1 - 0.12 * v;
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const edge = 1 - 0.1 * Math.abs(u - 0.5) * 2;
      const shade = vertical * edge;
      const o = (y * size + x) * 4;
      data[o] = Math.min(255, Math.round(tone[0] * shade));
      data[o + 1] = Math.min(255, Math.round(tone[1] * shade));
      data[o + 2] = Math.min(255, Math.round(tone[2] * shade));
      data[o + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

/** Feathered oval alpha mask used to blend the photo into the template. */
export function ovalMask(size: number, feather = 0.22): Buffer {
  const mask = Buffer.alloc(size * size);
  const rx = size * 0.38;
  const ry = size * 0.46;
  const cx = size / 2;
  const cy = size * 0.48;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      let a = 1;
      if (d > 1) a = 0;
      else if (d > 1 - feather) a = (1 - d) / feather;
      mask[y * size + x] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  return mask;
}

/** Blend + colour-adjust the aligned photo onto the head template. */
export async function compositeHead(alignedPng: Buffer, opts: { size: number; brightness: number; contrast: number; warmth: number; blend: number }): Promise<RgbaImage> {
  const template = await skinTemplate(opts.size);
  const { data: face } = await sharp(alignedPng).resize(opts.size, opts.size, { fit: "cover" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = ovalMask(opts.size);
  const out = Buffer.from(template.data);
  const contrast = 1 + opts.contrast;
  const brightness = opts.brightness * 255;
  const warmR = 1 + Math.max(0, opts.warmth) * 0.25 + Math.min(0, opts.warmth) * 0.05;
  const warmB = 1 - Math.max(0, opts.warmth) * 0.2 - Math.min(0, opts.warmth) * -0.25;
  for (let i = 0; i < opts.size * opts.size; i++) {
    const a = (mask[i]! / 255) * Math.max(0, Math.min(1, opts.blend));
    if (a <= 0) continue;
    for (let c = 0; c < 3; c++) {
      let v = face[i * 4 + c]!;
      v = (v - 128) * contrast + 128 + brightness;
      if (c === 0) v *= warmR;
      if (c === 2) v *= warmB;
      v = Math.max(0, Math.min(255, v));
      const base = out[i * 4 + c]!;
      out[i * 4 + c] = Math.round(base * (1 - a) + v * a);
    }
  }
  return { width: opts.size, height: opts.size, data: out };
}

export const faceProcessor: AssetProcessor = {
  name: "face",

  async validate(input: AssetInput): Promise<ValidationResult> {
    const issues: ValidationResult["issues"] = [];
    const hasImage = input.files.some((f) => /\.(png|jpe?g|webp)$/i.test(f.originalName ?? f.key));
    if (!hasImage) issues.push({ code: "MISSING_INPUT", message: "Upload a face photo (PNG or JPG).", severity: "error" });
    const parsed = faceConfigSchema.safeParse(input.config);
    if (!parsed.success) issues.push({ code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid face configuration", severity: "error" });
    return { ok: !issues.some((i) => i.severity === "error"), issues };
  },

  async process(job: ProcessingJob, ctx: ProcessorContext): Promise<ProcessingResult> {
    const reporter = job.reporter as WorkerReporter;
    const config = faceConfigSchema.parse(job.input.config);
    await reporter.stage("importing", 12, "Downloading your photo");
    const inputs = await downloadInputs(job.input, job.workDir, ctx.storage);
    const photo = inputs.first("png", "jpg", "jpeg", "webp");
    if (!photo) throw new ProcessingError("MISSING_INPUT", "Upload a face photo (PNG or JPG).");

    await reporter.stage("converting", 35, "Aligning the photo");
    let source = sharp(await readFile(photo.file));
    if (config.alignment.rotation) source = source.rotate(config.alignment.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const meta = await source.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) throw new ProcessingError("INVALID_IMAGE", "The uploaded photo could not be read.");
    // Apply the editor's pan/zoom before automatic alignment.
    const zoom = Math.max(0.2, config.alignment.scale);
    const cropW = Math.max(16, Math.round(Math.min(width, height) / zoom));
    const left = Math.max(0, Math.min(width - cropW, Math.round((width - cropW) / 2 + config.alignment.x * width)));
    const top = Math.max(0, Math.min(height - cropW, Math.round((height - cropW) / 2 + config.alignment.y * height)));
    const framed = await source.extract({ left, top, width: Math.min(cropW, width - left), height: Math.min(cropW, height - top) }).png().toBuffer();
    const aligned = await alignFace(framed, 1024);
    reporter.assertNotCancelled();

    await reporter.stage("textures", 60, "Blending onto the head template");
    const head = await compositeHead(aligned.png, { size: 1024, brightness: config.skin.brightness, contrast: config.skin.contrast, warmth: config.skin.warmth, blend: config.skin.blend });
    const dds = await encodeDds(head, "DXT5", true);

    const genderTag = config.gender === "male" ? "m" : "f";
    const resourceName = `modsmith_face_${genderTag}`;
    const textureName = `${genderTag}_head_000_a_ms`;
    const builder = await createResourceBuilder(resourceName, job.workDir);
    const ytd = await encodeTextureDictionary([{ name: textureName, dds }], textureName, { workDir: job.workDir });
    for (const f of ytd.files) await builder.addFile(`stream/${f.name}`, f.content);

    await reporter.stage("packaging", 85, "Packaging the resource");
    await builder.addFile("fxmanifest.lua", faceManifest({ resourceName }));
    const encoder = combineEncoders([ytd.encoder]);
    await builder.addFile(
      "README.md",
      buildReadme({
        title: `${resourceName} — head texture`,
        resourceName,
        intro: `A 1024² head diffuse built from your photo for the ${config.gender} freemode ped.`,
        usage: [
          `The texture dictionary is \`${textureName}\`; apply it to the ped head with your appearance script's custom-texture support.`,
          "With illenium-appearance or qb-clothing, register the texture as an add-on head overlay and select it in the clothing menu.",
        ],
        warnings: ytd.encoder !== "native" ? [encoderReadmeNote(encoder, builder.xmlFallbacks)] : undefined,
        notes: [`Alignment: ${aligned.method}`, `Blend: ${Math.round(config.skin.blend * 100)}%`],
      }),
    );

    const zipPath = path.join(job.workDir, `${resourceName}.zip`);
    await builder.writeZip(zipPath);
    const thumbnailPath = path.join(job.workDir, "thumbnail.png");
    await writeFile(thumbnailPath, await sharp(head.data, { raw: { width: head.width, height: head.height, channels: 4 } }).resize(512, 512).png().toBuffer());

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
          stats: { textures: 1, width: 1024, height: 1024, vramBytes: 1024 * 1024, faceBox: aligned.box },
          encoder,
          warnings: ytd.warnings,
        },
      },
      facts: { gender: config.gender, textureName, faceBox: aligned.box, alignment: aligned.method },
    };
  },

  async estimateCost(_input: AssetInput, ctx: ProcessorContext): Promise<CostEstimate> {
    return { credits: ctx.baseCost, breakdown: [{ label: "Face skin export", credits: ctx.baseCost }] };
  },
};
