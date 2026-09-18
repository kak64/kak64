import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AssetInput, AssetProcessor, CostEstimate, ProcessingJob, ProcessingResult, ProcessorContext, ValidationResult } from "@modsmith/core";
import { optimizerConfigSchema } from "@modsmith/core";
import type { WorkerReporter } from "../lib/context";
import { ProcessingError } from "../lib/errors";
import { ensureDir, extOf, walk } from "../lib/files";
import { downloadInputs } from "../lib/inputs";
import { loadRage } from "../lib/rage";
import { parseRsc7Header } from "../lib/rpf";
import { createZip, extractZip } from "../lib/zip";
import { buildYtd, encodeDds, mipCount, readYtdTextures, vramForTexture } from "../lib/textures";
import sharp from "sharp";

export type IssueSeverity = "critical" | "high" | "medium" | "low";
export type IssueCode = "OVERSIZED_TEXTURE" | "NO_MIPMAPS" | "MISSING_LOD" | "EXCESSIVE_VRAM" | "UNUSED_ASSET" | "RAW_IMAGE" | "UNCOMPRESSED_TEXTURE";

export interface ReportTexture {
  name: string;
  width: number;
  height: number;
  format: string;
  mips: number;
  vramBytes: number;
}

export interface ReportFile {
  path: string;
  type: "ytd" | "yft" | "ydr" | "ydd" | "ybn" | "png" | "dds" | "other";
  bytes: number;
  vramBytes: number;
  textures?: ReportTexture[];
  lods?: { high: boolean; med: boolean; low: boolean; vlow: boolean };
}

export interface ReportIssue {
  severity: IssueSeverity;
  code: IssueCode;
  path: string;
  texture?: string;
  message: string;
  recommendation: string;
  savingsBytes: number;
  fixable: boolean;
}

export interface OptimizerReport {
  totalBytes: number;
  estimatedVramBytes: number;
  files: ReportFile[];
  issues: ReportIssue[];
  beforeAfter?: { vramBytes: [number, number]; diskBytes: [number, number] };
}

const VRAM_BUDGET = { vehicle: 64 * 1024 * 1024, map: 128 * 1024 * 1024, general: 128 * 1024 * 1024 } as const;

function fileType(p: string): ReportFile["type"] {
  const ext = extOf(p);
  if (ext === "ytd" || ext === "yft" || ext === "ydr" || ext === "ydd" || ext === "ybn") return ext;
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp") return "png";
  if (ext === "dds") return "dds";
  return "other";
}

/** Files referenced by fxmanifest `files`/`data_file` declarations (best effort, for UNUSED_ASSET). */
export function manifestReferences(manifestText: string): Set<string> {
  const refs = new Set<string>();
  const re = /'([^']+)'|"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(manifestText)) !== null) {
    const value = (m[1] ?? m[2] ?? "").trim();
    if (!value || !value.includes(".")) continue;
    refs.add(value.replace(/^\.\//, ""));
    refs.add(path.posix.basename(value));
  }
  return refs;
}

const ASSET_EXTS = ["ytd", "ydr", "yft", "ydd", "ybn", "ytyp", "ymap", "ymt", "awc", "png", "jpg", "jpeg", "dds", "webp"];

/** Files that cost download size and should therefore be streamed or declared. */
function isAssetFile(p: string): boolean {
  return ASSET_EXTS.includes(extOf(p));
}

export interface AnalyzeOptions {
  maxTextureSize: number;
  kind: "general" | "vehicle" | "map";
}

/** Analyse a directory of extracted resource files and produce the OptimizerReport. */
export async function analyzeDirectory(dir: string, opts: AnalyzeOptions): Promise<OptimizerReport> {
  const rage = await loadRage();
  const relPaths = await walk(dir);
  const files: ReportFile[] = [];
  const issues: ReportIssue[] = [];
  let totalBytes = 0;
  let estimatedVramBytes = 0;

  const manifestRefs = new Set<string>();
  for (const rel of relPaths) {
    if (/fxmanifest\.lua$|__resource\.lua$/i.test(rel)) {
      for (const r of manifestReferences(await readFile(path.join(dir, rel), "utf8"))) manifestRefs.add(r);
    }
  }
  const hasManifest = relPaths.some((r) => /fxmanifest\.lua$|__resource\.lua$/i.test(r));

  for (const rel of relPaths) {
    const abs = path.join(dir, rel);
    const buf = await readFile(abs);
    const type = fileType(rel);
    totalBytes += buf.length;
    const entry: ReportFile = { path: rel, type, bytes: buf.length, vramBytes: 0 };

    // Prefer the codec's verified page-flag maths; fall back to our own header reader
    // when the file is truncated or the codec refuses it.
    const rsc = (rage?.parseRsc7 ? safeParseRsc7(rage.parseRsc7, buf) : null) ?? parseRsc7Header(buf);
    if (rsc) {
      entry.vramBytes = rsc.graphicsSize;
      estimatedVramBytes += rsc.graphicsSize;
    }

    if (type === "ytd") {
      const textures = await readYtdTextures(buf).catch(() => []);
      if (textures.length) {
        entry.textures = textures.map((t) => ({ name: t.name, width: t.width, height: t.height, format: t.format, mips: t.mipLevels, vramBytes: vramForTexture(t.width, t.height, t.format, t.mipLevels) }));
        const sum = entry.textures.reduce((n, t) => n + t.vramBytes, 0);
        if (!rsc) {
          entry.vramBytes = sum;
          estimatedVramBytes += sum;
        }
        for (const t of entry.textures) {
          const dim = Math.max(t.width, t.height);
          if (dim > opts.maxTextureSize) {
            const target = vramForTexture(Math.min(t.width, opts.maxTextureSize), Math.min(t.height, opts.maxTextureSize), t.format, t.mips);
            issues.push({
              severity: dim >= opts.maxTextureSize * 4 ? "critical" : "high",
              code: "OVERSIZED_TEXTURE",
              path: rel,
              texture: t.name,
              message: `${t.name} is ${t.width}×${t.height}, above the ${opts.maxTextureSize}px budget.`,
              recommendation: `Downscale ${t.name} to ${opts.maxTextureSize}px or smaller.`,
              savingsBytes: Math.max(0, t.vramBytes - target),
              fixable: true,
            });
          }
          if (t.mips <= 1 && Math.min(t.width, t.height) >= 256) {
            issues.push({
              severity: "medium",
              code: "NO_MIPMAPS",
              path: rel,
              texture: t.name,
              message: `${t.name} has no mipmaps, which causes shimmering and wasted bandwidth at distance.`,
              recommendation: "Regenerate the texture with a full mip chain.",
              savingsBytes: 0,
              fixable: true,
            });
          }
          if (/A8R8G8B8|R8G8B8A8|UNCOMPRESSED/i.test(t.format) && Math.min(t.width, t.height) >= 512) {
            const compressed = vramForTexture(t.width, t.height, "DXT5", t.mips);
            issues.push({
              severity: "high",
              code: "UNCOMPRESSED_TEXTURE",
              path: rel,
              texture: t.name,
              message: `${t.name} is stored uncompressed (${t.format}) at ${t.width}×${t.height}.`,
              recommendation: "Re-encode as DXT1 (opaque) or DXT5 (with alpha).",
              savingsBytes: Math.max(0, t.vramBytes - compressed),
              fixable: true,
            });
          }
        }
      }
    }

    if ((type === "ydr" || type === "yft") && rage) {
      try {
        const drawable = type === "ydr" ? rage.readYdr?.(buf) : rage.readYft?.(buf)?.drawable;
        if (drawable) {
          entry.lods = {
            high: (drawable.lods.high?.length ?? 0) > 0,
            med: (drawable.lods.med?.length ?? 0) > 0,
            low: (drawable.lods.low?.length ?? 0) > 0,
            vlow: (drawable.lods.vlow?.length ?? 0) > 0,
          };
          if (entry.lods.high && !entry.lods.med && !entry.lods.low && !entry.lods.vlow) {
            issues.push({
              severity: "medium",
              code: "MISSING_LOD",
              path: rel,
              message: `${path.basename(rel)} only has a high LOD, so the full mesh renders at every distance.`,
              recommendation: "Generate medium/low LODs (the Prop Creator or CodeWalker can do this).",
              savingsBytes: 0,
              fixable: false,
            });
          }
        }
      } catch {
        // Unreadable drawable: leave LOD information out rather than guessing.
      }
    }

    if (type === "png" || type === "dds") {
      if (type === "png") {
        const meta = await sharp(buf).metadata().catch(() => null);
        if (meta?.width && meta.height) {
          const raw = meta.width * meta.height * 4;
          entry.vramBytes = raw;
          estimatedVramBytes += raw;
          issues.push({
            severity: raw > 16 * 1024 * 1024 ? "high" : "low",
            code: "RAW_IMAGE",
            path: rel,
            message: `${path.basename(rel)} is a loose ${meta.width}×${meta.height} image; the game cannot stream it and it never gets compressed.`,
            recommendation: "Move the image into a .ytd as a DXT-compressed texture, or delete it if it is only a reference file.",
            savingsBytes: Math.max(0, raw - vramForTexture(meta.width, meta.height, "DXT5", mipCount(meta.width, meta.height))),
            fixable: true,
          });
        }
      }
    }

    // UNUSED_ASSET (best effort): an asset that is neither streamed nor named by the manifest.
    if (hasManifest && isAssetFile(rel)) {
      const base = path.posix.basename(rel);
      const streamed = /(^|\/)stream(ed)?(\/|$)/i.test(rel);
      if (!streamed && !manifestRefs.has(rel) && !manifestRefs.has(base)) {
        issues.push({
          severity: "low",
          code: "UNUSED_ASSET",
          path: rel,
          message: `${base} is neither inside a stream folder nor referenced by fxmanifest.lua.`,
          recommendation: "Move it into `stream/` or add it to the manifest — otherwise it just inflates the download.",
          savingsBytes: buf.length,
          fixable: false,
        });
      }
    }
    files.push(entry);
  }

  const budget = VRAM_BUDGET[opts.kind];
  if (estimatedVramBytes > budget) {
    issues.push({
      severity: estimatedVramBytes > budget * 2 ? "critical" : "high",
      code: "EXCESSIVE_VRAM",
      path: "",
      message: `This resource needs about ${(estimatedVramBytes / 1024 / 1024).toFixed(1)} MB of VRAM, over the ${(budget / 1024 / 1024).toFixed(0)} MB ${opts.kind} budget.`,
      recommendation: "Downscale the largest textures and make sure every texture is DXT-compressed with mipmaps.",
      savingsBytes: estimatedVramBytes - budget,
      fixable: true,
    });
  }

  const order: Record<IssueSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || b.savingsBytes - a.savingsBytes);
  return { totalBytes, estimatedVramBytes, files, issues };
}

function safeParseRsc7(fn: NonNullable<Awaited<ReturnType<typeof loadRage>>>["parseRsc7"], buf: Buffer) {
  try {
    const r = fn!(buf);
    return r.isRsc7 ? { systemSize: r.systemSize, graphicsSize: r.graphicsSize, version: r.version } : null;
  } catch {
    return null;
  }
}

/** Extract the job's input (ZIP or loose files) into a directory for analysis. */
async function stageInput(job: ProcessingJob, ctx: ProcessorContext): Promise<string> {
  const inputs = await downloadInputs(job.input, job.workDir, ctx.storage);
  const dir = await ensureDir(path.join(job.workDir, "resource"));
  const zip = inputs.first("zip");
  if (zip) {
    const entries = await extractZip(zip.file, dir);
    if (entries.some((e) => /\.fxap$/i.test(e))) {
      throw new ProcessingError("ESCROW_PROTECTED", "This resource is protected by FiveM asset escrow (.fxap) and cannot be modified.");
    }
    if (!entries.length) throw new ProcessingError("EMPTY_ARCHIVE", "The uploaded ZIP is empty.");
  } else if (inputs.files.length) {
    for (const f of inputs.files) await writeFile(path.join(dir, f.name), await readFile(f.file));
  } else {
    throw new ProcessingError("MISSING_INPUT", "Upload the resource ZIP (or its .ytd/.ydr/.yft files) to analyse.");
  }
  return dir;
}

/** Rebuild the resource with optimized textures. Geometry, metadata and scripts are copied untouched. */
async function optimizeDirectory(dir: string, outDir: string, opts: AnalyzeOptions & { generateMipmaps: boolean; compressTextures: boolean }, reporter: WorkerReporter): Promise<{ changed: string[]; warnings: string[] }> {
  const rels = await walk(dir);
  const changed: string[] = [];
  const warnings: string[] = [];
  let done = 0;
  for (const rel of rels) {
    const src = path.join(dir, rel);
    const dst = path.join(outDir, rel);
    await ensureDir(path.dirname(dst));
    const buf = await readFile(src);
    const type = fileType(rel);
    done++;
    if (done % 5 === 0) await reporter.stage("optimizing", 40 + Math.min(40, (done / rels.length) * 40), `Optimizing ${path.basename(rel)}`);
    reporter.assertNotCancelled();

    if (type === "ytd" && opts.compressTextures) {
      try {
        const textures = await readYtdTextures(buf);
        if (textures.length) {
          const rebuilt: { name: string; dds: Buffer }[] = [];
          let touched = false;
          for (const t of textures) {
            const dim = Math.max(t.width, t.height);
            const needsResize = dim > opts.maxTextureSize;
            const needsMips = opts.generateMipmaps && t.mipLevels <= 1 && Math.min(t.width, t.height) >= 256;
            const needsCompress = /A8R8G8B8|R8G8B8A8/i.test(t.format);
            if (!needsResize && !needsMips && !needsCompress) {
              rebuilt.push({ name: t.name, dds: t.dds() });
              continue;
            }
            const rgba = t.rgba(0);
            if (!rgba) {
              rebuilt.push({ name: t.name, dds: t.dds() });
              warnings.push(`${t.name} in ${rel} could not be decoded and was copied unchanged.`);
              continue;
            }
            const scale = needsResize ? opts.maxTextureSize / dim : 1;
            const width = Math.max(4, Math.round(rgba.width * scale));
            const height = Math.max(4, Math.round(rgba.height * scale));
            const resized = scale === 1
              ? { width: rgba.width, height: rgba.height, data: Buffer.from(rgba.data) }
              : await (async () => {
                  const { data, info } = await sharp(Buffer.from(rgba.data), { raw: { width: rgba.width, height: rgba.height, channels: 4 } })
                    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
                    .raw()
                    .toBuffer({ resolveWithObject: true });
                  return { width: info.width, height: info.height, data };
                })();
            let alpha = false;
            for (let i = 3; i < resized.data.length; i += 4) {
              if (resized.data[i]! < 250) {
                alpha = true;
                break;
              }
            }
            rebuilt.push({ name: t.name, dds: await encodeDds(resized, alpha ? "DXT5" : "DXT1", opts.generateMipmaps) });
            touched = true;
          }
          if (touched) {
            await writeFile(dst, await buildYtd(rebuilt));
            changed.push(rel);
            continue;
          }
        }
      } catch (err) {
        warnings.push(`${rel} could not be rebuilt (${(err as Error).message}); the original was kept.`);
      }
    }

    if (type === "png") {
      const meta = await sharp(buf).metadata().catch(() => null);
      if (meta?.width && meta.height && Math.max(meta.width, meta.height) > opts.maxTextureSize) {
        const scale = opts.maxTextureSize / Math.max(meta.width, meta.height);
        const out = await sharp(buf).resize(Math.round(meta.width * scale), Math.round(meta.height * scale), { fit: "fill" }).png().toBuffer();
        await writeFile(dst, out);
        changed.push(rel);
        continue;
      }
    }

    await writeFile(dst, buf);
  }
  return { changed, warnings };
}

export const optimizerProcessor: AssetProcessor = {
  name: "optimizer",

  async validate(input: AssetInput): Promise<ValidationResult> {
    const issues: ValidationResult["issues"] = [];
    if (!input.files.length) issues.push({ code: "MISSING_INPUT", message: "Upload the resource ZIP you want to analyse.", severity: "error" });
    const parsed = optimizerConfigSchema.safeParse(input.config);
    if (!parsed.success) issues.push({ code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid optimizer configuration", severity: "error" });
    return { ok: !issues.some((i) => i.severity === "error"), issues };
  },

  async process(job: ProcessingJob, ctx: ProcessorContext): Promise<ProcessingResult> {
    const reporter = job.reporter as WorkerReporter;
    const config = optimizerConfigSchema.parse(job.input.config);
    await reporter.stage("importing", 10, "Unpacking the resource");
    const dir = await stageInput(job, ctx);
    reporter.assertNotCancelled();

    await reporter.stage("optimizing", 30, "Analysing files");
    const report = await analyzeDirectory(dir, { maxTextureSize: config.maxTextureSize, kind: config.kind });
    await reporter.log(`Found ${report.files.length} files, ${report.issues.length} issues, ~${(report.estimatedVramBytes / 1024 / 1024).toFixed(1)} MB VRAM`);

    if (config.mode === "analyze") {
      const reportPath = path.join(job.workDir, "report.json");
      await writeFile(reportPath, JSON.stringify(report, null, 2));
      await reporter.stage("complete", 99, "Report ready");
      return {
        ok: true,
        artifact: {
          localPath: reportPath,
          fileName: "report.json",
          mime: "application/json",
          manifest: {
            stats: { files: report.files.length, issues: report.issues.length, vramBytes: report.estimatedVramBytes, diskBytes: report.totalBytes },
            report,
            encoder: "native",
          },
        },
        facts: { mode: "analyze", issues: report.issues.length, vramBytes: report.estimatedVramBytes },
      };
    }

    const outDir = await ensureDir(path.join(job.workDir, "optimized"));
    const { changed, warnings } = await optimizeDirectory(dir, outDir, { maxTextureSize: config.maxTextureSize, kind: config.kind, generateMipmaps: config.generateMipmaps, compressTextures: config.compressTextures }, reporter);
    const after = await analyzeDirectory(outDir, { maxTextureSize: config.maxTextureSize, kind: config.kind });
    after.beforeAfter = {
      vramBytes: [report.estimatedVramBytes, after.estimatedVramBytes],
      diskBytes: [report.totalBytes, after.totalBytes],
    };

    await reporter.stage("packaging", 90, "Packaging the optimized resource");
    const rels = await walk(outDir);
    const baseName = path.basename(dir) === "resource" ? "optimized" : path.basename(dir);
    const zipPath = path.join(job.workDir, `${baseName}.zip`);
    await createZip(zipPath, rels.map((rel) => ({ name: rel, file: path.join(outDir, rel) })));
    const reportPath = path.join(job.workDir, "report.json");
    await writeFile(reportPath, JSON.stringify(after, null, 2));

    await reporter.stage("complete", 99, "Done");
    return {
      ok: true,
      artifact: {
        localPath: zipPath,
        fileName: `${baseName}.zip`,
        mime: "application/zip",
        manifest: {
          files: rels.map((rel) => ({ path: rel, size: after.files.find((f) => f.path === rel)?.bytes ?? 0 })),
          stats: {
            files: after.files.length,
            rebuilt: changed.length,
            vramBefore: report.estimatedVramBytes,
            vramAfter: after.estimatedVramBytes,
            diskBefore: report.totalBytes,
            diskAfter: after.totalBytes,
          },
          report: after,
          warnings,
          encoder: "native",
          __extraArtifacts: [{ name: "report.json", path: reportPath }],
        },
      },
      facts: { mode: "optimize", rebuilt: changed.length, vramSaved: Math.max(0, report.estimatedVramBytes - after.estimatedVramBytes) },
    };
  },

  async estimateCost(_input: AssetInput, ctx: ProcessorContext): Promise<CostEstimate> {
    return { credits: ctx.baseCost, breakdown: [{ label: "Resource optimization", credits: ctx.baseCost }] };
  },
};
