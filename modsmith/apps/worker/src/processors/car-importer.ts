import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AssetInput, AssetProcessor, CostEstimate, ProcessingJob, ProcessingResult, ProcessorContext, ValidationResult } from "@modsmith/core";
import { carImporterConfigSchema } from "@modsmith/core";
import type { WorkerReporter } from "../lib/context";
import { ProcessingError } from "../lib/errors";
import { ensureDir, extOf, walk } from "../lib/files";
import { findDownloadLinks, safeDownload, safeFetch } from "../lib/fetch";
import { downloadInputs } from "../lib/inputs";
import { vehicleManifest } from "../lib/manifest";
import { extractRpfFiles } from "../lib/rpf";
import { buildReadme, createResourceBuilder } from "../lib/resource";
import { extractZip } from "../lib/zip";
import {
  buildCarColsMeta,
  buildCarVariationsMeta,
  buildHandlingMeta,
  buildVehiclesMeta,
  HANDLING_PRESETS,
  readModelNames,
  rewriteMetaIdentifiers,
} from "../library/vehicle-meta";
import { isVanillaVehicle, vehicleClassFor } from "../library/vehicles";

const execFileAsync = promisify(execFile);

const META_FILES = ["vehicles.meta", "handling.meta", "carcols.meta", "carvariations.meta", "vehiclelayouts.meta", "dlctext.meta"];
const AUDIO_PATTERNS = [/\.awc$/i, /\.dat151\.rel$/i, /\.dat54\.rel$/i, /\.nametable$/i, /\.dat10\.rel$/i];

export interface CollectedFiles {
  vehicleFiles: { name: string; data: Buffer }[];
  metaFiles: { name: string; text: string }[];
  audioFiles: { name: string; data: Buffer }[];
}

/** Find the archive download link on a gta5-mods model page. */
export async function resolveModArchiveUrl(pageUrl: string): Promise<string> {
  const page = await safeFetch(pageUrl, { maxBytes: 8 * 1024 * 1024 });
  const html = page.buffer.toString("utf8");
  const links = findDownloadLinks(html, page.finalUrl);
  const best = links.find((l) => /\/download\/\d+/.test(l)) ?? links[0];
  if (!best) {
    throw new ProcessingError(
      "SOURCE_UNSUPPORTED",
      "We could not find a download link on that page — it likely needs a browser (JavaScript or a consent screen). Download the archive yourself and upload the ZIP instead.",
    );
  }
  return best;
}

async function extractArchive(file: string, dest: string, reporter: WorkerReporter): Promise<string[]> {
  const ext = extOf(file);
  if (ext === "zip") return extractZip(file, dest);
  // RAR/7z/OIV need a system tool; OIV archives are ZIPs with a manifest, so try ZIP first.
  if (ext === "oiv") {
    try {
      return await extractZip(file, dest);
    } catch {
      // fall through to the CLI tools
    }
  }
  for (const [bin, args] of [
    ["7z", ["x", "-y", `-o${dest}`, file]],
    ["7za", ["x", "-y", `-o${dest}`, file]],
    ["unrar", ["x", "-y", file, dest]],
  ] as [string, string[]][]) {
    try {
      await execFileAsync(bin, args, { timeout: 5 * 60_000, maxBuffer: 16 * 1024 * 1024 });
      await reporter.log(`Extracted the archive with ${bin}`);
      return walk(dest);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") continue;
    }
  }
  throw new ProcessingError(
    "ARCHIVE_UNSUPPORTED",
    `.${ext.toUpperCase()} archives cannot be opened on this worker. Re-pack the mod as a ZIP and upload it.`,
  );
}

/** Walk an extracted mod folder, pulling vehicle/meta/audio files out of loose files and dlc.rpf archives. */
export async function collectVehicleFiles(dir: string, reporter: WorkerReporter): Promise<CollectedFiles> {
  const out: CollectedFiles = { vehicleFiles: [], metaFiles: [], audioFiles: [] };
  const rels = await walk(dir);
  const seen = new Set<string>();

  const take = async (name: string, data: Buffer) => {
    const base = path.posix.basename(name).toLowerCase();
    if (seen.has(base)) return;
    seen.add(base);
    if (/\.(yft|ytd|ydr|ybn)$/i.test(base)) out.vehicleFiles.push({ name: base, data });
    else if (META_FILES.includes(base)) out.metaFiles.push({ name: base, text: data.toString("utf8") });
    else if (AUDIO_PATTERNS.some((re) => re.test(base))) out.audioFiles.push({ name: base, data });
  };

  for (const rel of rels) {
    const abs = path.join(dir, rel);
    const base = path.posix.basename(rel).toLowerCase();
    if (base.endsWith(".rpf")) {
      await reporter.log(`Reading ${rel}`);
      const buf = await readFile(abs);
      const files = extractRpfFiles(buf, {
        filter: (p) => /\.(yft|ytd|ydr|ybn|awc|nametable)$/i.test(p) || META_FILES.includes(path.posix.basename(p).toLowerCase()) || /\.(dat151|dat54|dat10)\.rel$/i.test(p),
      });
      for (const f of files) await take(f.path, f.data);
      continue;
    }
    await take(rel, await readFile(abs));
  }
  return out;
}

export interface ModelDetection {
  replaceDetected: boolean;
  originalModel: string;
  reason: string;
}

/** A mod is a "replace" when it has no vehicles.meta, or its model name is a base-game vehicle. */
export function detectReplace(collected: CollectedFiles): ModelDetection {
  const vehiclesMeta = collected.metaFiles.find((m) => m.name === "vehicles.meta");
  const modelFromFiles = collected.vehicleFiles
    .filter((f) => f.name.endsWith(".yft") && !f.name.endsWith("_hi.yft"))
    .map((f) => f.name.replace(/\.yft$/i, ""))[0] ?? collected.vehicleFiles.find((f) => f.name.endsWith(".ytd"))?.name.replace(/\.ytd$/i, "") ?? "vehicle";

  if (!vehiclesMeta) {
    return { replaceDetected: true, originalModel: modelFromFiles, reason: "no vehicles.meta was included" };
  }
  const names = readModelNames(vehiclesMeta.text);
  const declared = names[0] ?? modelFromFiles;
  if (names.some((n) => isVanillaVehicle(n))) {
    return { replaceDetected: true, originalModel: names.find((n) => isVanillaVehicle(n))!, reason: "the model name matches a base-game vehicle" };
  }
  return { replaceDetected: false, originalModel: declared, reason: "vehicles.meta declares an add-on model name" };
}

function audioHashFrom(collected: CollectedFiles, fallback: string): string {
  const nametable = collected.audioFiles.find((f) => /\.nametable$/i.test(f.name));
  if (nametable) {
    const names = nametable.data.toString("latin1").split("\0").map((s) => s.trim()).filter((s) => /^[a-z0-9_]{3,40}$/i.test(s));
    const vehicleish = names.find((n) => !/^dlc|^audio/i.test(n));
    if (vehicleish) return vehicleish.toLowerCase();
  }
  const awc = collected.audioFiles.find((f) => /\.awc$/i.test(f.name));
  if (awc) return awc.name.replace(/_(npc|game)\.awc$/i, "").replace(/\.awc$/i, "").toLowerCase();
  return fallback;
}

export const carImporterProcessor: AssetProcessor = {
  name: "car-importer",

  async validate(input: AssetInput): Promise<ValidationResult> {
    const issues: ValidationResult["issues"] = [];
    const parsed = carImporterConfigSchema.safeParse(input.config);
    if (!parsed.success) {
      issues.push({ code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid car importer configuration", severity: "error" });
      return { ok: false, issues };
    }
    if (!parsed.data.rightsConfirmed) {
      issues.push({ code: "RIGHTS_NOT_CONFIRMED", message: "You must confirm you have the right to use this mod.", severity: "error" });
    }
    const hasSource = !!parsed.data.sourceUrl || !!input.externalRef?.url || input.files.length > 0;
    if (!hasSource) issues.push({ code: "MISSING_INPUT", message: "Paste a GTA5-Mods link or upload the mod archive.", severity: "error" });
    return { ok: !issues.some((i) => i.severity === "error"), issues };
  },

  async process(job: ProcessingJob, ctx: ProcessorContext): Promise<ProcessingResult> {
    const reporter = job.reporter as WorkerReporter;
    const config = carImporterConfigSchema.parse(job.input.config);
    const workDir = job.workDir;
    const extractDir = await ensureDir(path.join(workDir, "mod"));

    await reporter.stage("importing", 10, "Fetching the mod");
    let sourceUrl: string | null = config.sourceUrl ?? job.input.externalRef?.url ?? null;
    let archiveFile: string | null = null;

    const inputs = await downloadInputs(job.input, workDir, ctx.storage);
    const uploaded = inputs.first("zip", "rar", "7z", "oiv");
    if (uploaded) {
      archiveFile = uploaded.file;
    } else if (sourceUrl) {
      const archiveUrl = /\/download\//.test(sourceUrl) ? sourceUrl : await resolveModArchiveUrl(sourceUrl);
      await reporter.log(`Downloading ${archiveUrl}`);
      archiveFile = path.join(workDir, "download.bin");
      const { bytes, contentType } = await safeDownload(archiveUrl, archiveFile, { maxBytes: 1024 * 1024 * 1024 });
      if (bytes < 1024) throw new ProcessingError("SOURCE_UNSUPPORTED", "The download returned an empty file — download the archive yourself and upload the ZIP instead.");
      const head = await readFile(archiveFile).then((b) => b.subarray(0, 8));
      const isZip = head[0] === 0x50 && head[1] === 0x4b;
      const isRar = head.subarray(0, 4).toString("latin1") === "Rar!";
      const is7z = head.subarray(0, 2).toString("latin1") === "7z";
      if (!isZip && !isRar && !is7z) {
        throw new ProcessingError("SOURCE_UNSUPPORTED", `That link returned ${contentType ?? "an unknown file type"} rather than a mod archive. Download it yourself and upload the ZIP.`);
      }
      const ext = isZip ? "zip" : isRar ? "rar" : "7z";
      const renamed = path.join(workDir, `download.${ext}`);
      await writeFile(renamed, await readFile(archiveFile));
      archiveFile = renamed;
    }
    if (!archiveFile) throw new ProcessingError("MISSING_INPUT", "Paste a GTA5-Mods link or upload the mod archive.");
    reporter.assertNotCancelled();

    await reporter.stage("importing", 25, "Extracting the archive");
    await extractArchive(archiveFile, extractDir, reporter);
    reporter.assertNotCancelled();

    await reporter.stage("converting", 40, "Collecting vehicle files");
    const collected = await collectVehicleFiles(extractDir, reporter);
    if (!collected.vehicleFiles.some((f) => f.name.endsWith(".yft"))) {
      throw new ProcessingError("NO_VEHICLE_FOUND", "No vehicle model (.yft) was found in that archive. Make sure it is a vehicle mod and not a script or a texture pack.");
    }

    const detection = detectReplace(collected);
    await reporter.log(`${detection.replaceDetected ? "Replace" : "Add-on"} mod detected (${detection.reason}); model: ${detection.originalModel}`);

    const convert = detection.replaceDetected && config.convertReplaceToAddon;
    const spawnName = (convert ? config.newSpawnName ?? `${detection.originalModel}_ms` : detection.originalModel).toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 24) || "modsmith_car";
    const vehicleClass = vehicleClassFor(detection.originalModel);
    const audioHash = config.keepAudio && collected.audioFiles.length ? audioHashFrom(collected, detection.originalModel) : "";

    await reporter.stage("packaging", 62, "Building the resource");
    const builder = await createResourceBuilder(spawnName, workDir);
    const warnings: string[] = [];

    // stream/: models and textures, renamed to the new spawn name when converting.
    const renameMap = new Map<string, string>();
    for (const f of collected.vehicleFiles) {
      let name = f.name;
      if (convert) {
        const base = f.name.replace(/\.(yft|ytd|ydr|ybn)$/i, "");
        const ext = extOf(f.name);
        const isHi = /_hi$/i.test(base);
        const stem = base.replace(/_hi$/i, "");
        if (stem.toLowerCase() === detection.originalModel.toLowerCase()) name = `${spawnName}${isHi ? "_hi" : ""}.${ext}`;
        else if (stem.toLowerCase().startsWith(detection.originalModel.toLowerCase())) name = `${spawnName}${stem.slice(detection.originalModel.length)}${isHi ? "_hi" : ""}.${ext}`;
      }
      renameMap.set(f.name, name);
      await builder.addFile(`stream/${name}`, f.data);
    }

    // data/: existing meta rewritten, or synthesised from templates.
    const dataFiles: { vehicles: boolean; handling: boolean; carcols: boolean; carvariations: boolean; layouts: boolean } = {
      vehicles: false,
      handling: false,
      carcols: false,
      carvariations: false,
      layouts: false,
    };
    const mapping = { modelName: spawnName, txdName: spawnName, handlingId: spawnName, gameName: spawnName.toUpperCase(), audioNameHash: audioHash };
    for (const meta of collected.metaFiles) {
      if (meta.name === "dlctext.meta") continue;
      const text = convert ? rewriteMetaIdentifiers(meta.text, mapping) : meta.text;
      await builder.addFile(`data/${meta.name}`, text);
      if (meta.name === "vehicles.meta") dataFiles.vehicles = true;
      if (meta.name === "handling.meta") dataFiles.handling = true;
      if (meta.name === "carcols.meta") dataFiles.carcols = true;
      if (meta.name === "carvariations.meta") dataFiles.carvariations = true;
      if (meta.name === "vehiclelayouts.meta") dataFiles.layouts = true;
    }
    const preset = HANDLING_PRESETS[vehicleClass] ?? HANDLING_PRESETS.generic;
    if (!dataFiles.vehicles) {
      await builder.addFile("data/vehicles.meta", buildVehiclesMeta({ spawnName, audioNameHash: audioHash, vehicleClass }));
      dataFiles.vehicles = true;
      warnings.push("vehicles.meta was generated from a template — check the vehicle class, seats and camera settings before shipping.");
    }
    if (!dataFiles.handling) {
      await builder.addFile("data/handling.meta", buildHandlingMeta({ handlingId: spawnName, preset }));
      dataFiles.handling = true;
      warnings.push(`handling.meta was generated from the "${vehicleClass}" preset because the mod did not include one.`);
    }
    if (!dataFiles.carvariations) {
      await builder.addFile("data/carvariations.meta", buildCarVariationsMeta({ spawnName, kits: [`0_${spawnName}_modkit`] }));
      dataFiles.carvariations = true;
    }
    if (!dataFiles.carcols) {
      await builder.addFile("data/carcols.meta", buildCarColsMeta({ spawnName }));
      dataFiles.carcols = true;
    }

    // Audio: keep the original files so engine sounds survive the conversion.
    const gameData: string[] = [];
    const soundData: string[] = [];
    const wavePacks: string[] = [];
    if (config.keepAudio) {
      for (const a of collected.audioFiles) {
        if (/\.awc$/i.test(a.name)) {
          const pack = a.name.replace(/\.awc$/i, "");
          await builder.addFile(`sfx/${pack}/${a.name}`, a.data);
          wavePacks.push(pack);
        } else if (/\.dat151\.rel$/i.test(a.name)) {
          await builder.addFile(`audioconfig/${a.name}`, a.data);
          gameData.push(a.name.replace(/\.dat151\.rel$/i, ""));
        } else if (/\.dat54\.rel$/i.test(a.name)) {
          await builder.addFile(`audioconfig/${a.name}`, a.data);
          soundData.push(a.name.replace(/\.dat54\.rel$/i, ""));
        } else {
          await builder.addFile(`audioconfig/${a.name}`, a.data);
        }
      }
      if (collected.audioFiles.length && !audioHash) warnings.push("Audio files were included but no audio name could be detected; set <audioNameHash> in vehicles.meta if the engine sound is silent.");
    }

    await builder.addFile(
      "fxmanifest.lua",
      vehicleManifest({
        resourceName: spawnName,
        vehiclesMeta: dataFiles.vehicles,
        handlingMeta: dataFiles.handling,
        carcolsMeta: dataFiles.carcols,
        carvariationsMeta: dataFiles.carvariations,
        vehicleLayoutsMeta: dataFiles.layouts,
        audio: { gameData, soundData, wavePacks },
      }),
    );

    await builder.addFile(
      "README.md",
      buildReadme({
        title: `${spawnName} — add-on vehicle`,
        resourceName: spawnName,
        intro: convert
          ? `Converted from a replace mod for \`${detection.originalModel}\` into a standalone add-on that spawns as \`${spawnName}\`.`
          : `Packaged as an add-on vehicle that spawns as \`${spawnName}\`.`,
        usage: [`Spawn it in game with \`/car ${spawnName}\` (or your framework's vehicle command).`],
        warnings: warnings.length ? warnings : undefined,
        notes: [
          `Original model: ${detection.originalModel}`,
          `Detection: ${detection.reason}`,
          `Audio preserved: ${config.keepAudio && collected.audioFiles.length ? `yes (${collected.audioFiles.length} files${audioHash ? `, hash ${audioHash}` : ""})` : "no audio files in the mod"}`,
          `Model files: ${collected.vehicleFiles.length}`,
        ],
        credits: sourceUrl ? { model: detection.originalModel, author: "See source page", license: "As published on the source site", sourceUrl } : undefined,
      }),
    );
    if (sourceUrl) {
      await builder.addFile(
        "CREDITS.txt",
        [
          "This vehicle was imported from a third-party mod.",
          "",
          `Source: ${sourceUrl}`,
          `Original model: ${detection.originalModel}`,
          "",
          "Keep the original author's credit intact and respect the license on the source page.",
          "",
        ].join("\n"),
      );
    }

    const zipPath = path.join(workDir, `${spawnName}.zip`);
    await builder.writeZip(zipPath);

    await reporter.stage("complete", 99, "Done");
    return {
      ok: true,
      artifact: {
        localPath: zipPath,
        fileName: `${spawnName}.zip`,
        mime: "application/zip",
        manifest: {
          files: builder.files,
          stats: {
            models: collected.vehicleFiles.length,
            metaFiles: collected.metaFiles.length,
            audioFiles: collected.audioFiles.length,
            diskBytes: builder.totalBytes,
          },
          encoder: "native",
          warnings,
        },
      },
      facts: {
        replaceDetected: detection.replaceDetected,
        originalModel: detection.originalModel,
        spawnName,
        audioPreserved: config.keepAudio && collected.audioFiles.length > 0,
        files: [...renameMap.values()],
        sourceUrl,
      },
    };
  },

  async estimateCost(_input: AssetInput, ctx: ProcessorContext): Promise<CostEstimate> {
    return { credits: ctx.baseCost, breakdown: [{ label: "Vehicle import", credits: ctx.baseCost }] };
  },
};
