import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { workerEnv } from "./env";
import { ProcessingError } from "./errors";
import { exists } from "./files";
import { log } from "./log";
import {
  ddsAsRageTextures,
  getRage,
  rageCapabilitiesSync,
  toBoundInput,
  toDrawableInput,
  toRageDrawable,
  toYtypInput,
  type BoundBuild,
  type DrawableBuild,
  type YtypBuild,
} from "./rage";

const execFileAsync = promisify(execFile);

export type EncoderKind = "native" | "codewalker-xml" | "codewalker-cli";

export interface EncodedFile {
  /** File name inside the resource (may include a sub-directory for sidecar DDS files). */
  name: string;
  content: Buffer;
}

export interface EncodeResult {
  files: EncodedFile[];
  encoder: EncoderKind;
  warnings: string[];
}

export interface EncodeContext {
  /** Scratch directory used for CodeWalker CLI round-trips. */
  workDir: string;
}

/**
 * Encoder strategy, strongest first:
 *   1. the native binary writer, but only when `CAPABILITIES` calls that format `native`;
 *   2. CodeWalker XML converted to binary by `CODEWALKER_CLI`;
 *   3. CodeWalker XML shipped in the ZIP with README instructions.
 * The chosen path is reported so a manifest never claims a native file that was not written.
 */
export function combineEncoders(kinds: EncoderKind[]): EncoderKind {
  if (kinds.some((k) => k === "codewalker-xml")) return "codewalker-xml";
  if (kinds.some((k) => k === "codewalker-cli")) return "codewalker-cli";
  return "native";
}

/** Convert a CodeWalker XML file to its binary form with the configured CLI. */
export async function runCodewalkerCli(xmlPath: string, outPath: string): Promise<boolean> {
  const cli = workerEnv().codewalkerCli;
  if (!cli) return false;
  try {
    await mkdir(path.dirname(outPath), { recursive: true });
    await execFileAsync(cli, ["--import", xmlPath, "--output", outPath], { timeout: 5 * 60_000, maxBuffer: 8 * 1024 * 1024 });
    return await exists(outPath);
  } catch (err) {
    log.warn({ err: (err as Error).message, xmlPath }, "CodeWalker CLI conversion failed");
    return false;
  }
}

/** Write the XML (plus any sidecar files) to the scratch dir and try the CLI on it. */
async function tryCli(opts: { xmlName: string; xml: string; binaryName: string; workDir: string; sidecars?: EncodedFile[] }): Promise<EncodedFile | null> {
  if (!workerEnv().codewalkerCli) return null;
  const dir = path.join(opts.workDir, ".cw", path.basename(opts.binaryName, path.extname(opts.binaryName)));
  await mkdir(dir, { recursive: true });
  const xmlPath = path.join(dir, opts.xmlName);
  const outPath = path.join(dir, opts.binaryName);
  await writeFile(xmlPath, opts.xml, "utf8");
  for (const s of opts.sidecars ?? []) {
    const file = path.join(dir, path.basename(s.name));
    await writeFile(file, s.content);
  }
  if (!(await runCodewalkerCli(xmlPath, outPath))) return null;
  return { name: opts.binaryName, content: await readFile(outPath) };
}

/** Encode a drawable as `<name>.ydr` (native) or `<name>.ydr.xml` (+ CLI conversion). */
export async function encodeDrawable(build: DrawableBuild, baseName: string, ctx: EncodeContext): Promise<EncodeResult> {
  const rage = getRage();
  const caps = rageCapabilitiesSync();
  const warnings: string[] = [];
  if (caps.writeYdr && rage.writeYdr) {
    try {
      return { files: [{ name: `${baseName}.ydr`, content: rage.writeYdr(toDrawableInput(build)) }], encoder: "native", warnings };
    } catch (err) {
      warnings.push(`Native .ydr encoding failed (${(err as Error).message}); falling back to CodeWalker XML.`);
    }
  }
  if (rage.ydrXml) {
    const xml = rage.ydrXml(toRageDrawable(build), { name: baseName });
    const viaCli = await tryCli({ xmlName: `${baseName}.ydr.xml`, xml, binaryName: `${baseName}.ydr`, workDir: ctx.workDir });
    if (viaCli) return { files: [viaCli], encoder: "codewalker-cli", warnings };
    warnings.push(`${baseName}.ydr is included as CodeWalker XML (${baseName}.ydr.xml): this build cannot write a verified binary drawable, so import it once with CodeWalker before streaming (see README).`);
    return { files: [{ name: `${baseName}.ydr.xml`, content: Buffer.from(xml, "utf8") }], encoder: "codewalker-xml", warnings };
  }
  throw new ProcessingError("RAGE_UNSUPPORTED", "This worker cannot write drawables (no native writer and no CodeWalker XML exporter)", { infrastructure: true, retryable: true });
}

/** Encode a collision bound as `<name>.ybn` (native) or `<name>.ybn.xml` (+ CLI conversion). */
export async function encodeBound(build: BoundBuild, baseName: string, ctx: EncodeContext): Promise<EncodeResult> {
  const rage = getRage();
  const caps = rageCapabilitiesSync();
  const warnings: string[] = [];
  const input = toBoundInput(build);
  if (caps.writeYbn && rage.writeYbn) {
    try {
      return { files: [{ name: `${baseName}.ybn`, content: rage.writeYbn(input) }], encoder: "native", warnings };
    } catch (err) {
      warnings.push(`Native .ybn encoding failed (${(err as Error).message}); falling back to CodeWalker XML.`);
    }
  }
  // The XML emitter consumes a reader-shaped bound, so round-trip the (unverified) writer
  // output through the reader to describe exactly the bound we intend to ship.
  if (rage.ybnXml && rage.writeYbn && rage.readYbn) {
    try {
      const bound = rage.readYbn(rage.writeYbn(input));
      const xml = rage.ybnXml(bound);
      const viaCli = await tryCli({ xmlName: `${baseName}.ybn.xml`, xml, binaryName: `${baseName}.ybn`, workDir: ctx.workDir });
      if (viaCli) return { files: [viaCli], encoder: "codewalker-cli", warnings };
      warnings.push(`${baseName}.ybn is included as CodeWalker XML (${baseName}.ybn.xml) — import it with CodeWalker to get collision in game.`);
      return { files: [{ name: `${baseName}.ybn.xml`, content: Buffer.from(xml, "utf8") }], encoder: "codewalker-xml", warnings };
    } catch (err) {
      warnings.push(`Collision could not be generated (${(err as Error).message}); the resource ships without a .ybn.`);
      return { files: [], encoder: "codewalker-xml", warnings };
    }
  }
  throw new ProcessingError("RAGE_UNSUPPORTED", "This worker cannot write collision bounds", { infrastructure: true, retryable: true });
}

/** Encode an archetype definition as `<name>.ytyp` (native) or `<name>.ytyp.xml` (+ CLI). */
export async function encodeYtyp(build: YtypBuild, baseName: string, ctx: EncodeContext): Promise<EncodeResult> {
  const rage = getRage();
  const caps = rageCapabilitiesSync();
  const warnings: string[] = [];
  const input = toYtypInput(build);
  if (caps.writeYtyp && rage.writeYtyp) {
    try {
      return { files: [{ name: `${baseName}.ytyp`, content: rage.writeYtyp(input) }], encoder: "native", warnings };
    } catch (err) {
      warnings.push(`Native .ytyp encoding failed (${(err as Error).message}); falling back to CodeWalker XML.`);
    }
  }
  if (rage.ytypXml) {
    const xml = rage.ytypXml(input);
    const viaCli = await tryCli({ xmlName: `${baseName}.ytyp.xml`, xml, binaryName: `${baseName}.ytyp`, workDir: ctx.workDir });
    if (viaCli) return { files: [viaCli], encoder: "codewalker-cli", warnings };
    warnings.push(`ytyp requires CodeWalker import — the ZIP contains ${baseName}.ytyp.xml; open it in CodeWalker, save it as ${baseName}.ytyp next to the XML and add it to fxmanifest.lua before streaming.`);
    return { files: [{ name: `${baseName}.ytyp.xml`, content: Buffer.from(xml, "utf8") }], encoder: "codewalker-xml", warnings };
  }
  warnings.push("No .ytyp was produced: this worker has neither a native writer nor a CodeWalker XML exporter for archetypes.");
  return { files: [], encoder: "codewalker-xml", warnings };
}

/** Encode a texture dictionary. `.ytd` is tier-1 native; XML + sidecar DDS is the fallback. */
export async function encodeTextureDictionary(textures: { name: string; dds: Buffer }[], baseName: string, ctx: EncodeContext): Promise<EncodeResult> {
  const rage = getRage();
  const caps = rageCapabilitiesSync();
  const warnings: string[] = [];
  if (!textures.length) return { files: [], encoder: "native", warnings };
  if (caps.writeYtd && rage.writeYtd) {
    try {
      return { files: [{ name: `${baseName}.ytd`, content: rage.writeYtd(textures) }], encoder: "native", warnings };
    } catch (err) {
      warnings.push(`Native .ytd encoding failed (${(err as Error).message}); falling back to CodeWalker XML.`);
    }
  }
  if (rage.ytdXml) {
    const xml = rage.ytdXml(ddsAsRageTextures(textures));
    const sidecars: EncodedFile[] = textures.map((t) => ({ name: `${t.name}.dds`, content: t.dds }));
    const viaCli = await tryCli({ xmlName: `${baseName}.ytd.xml`, xml, binaryName: `${baseName}.ytd`, workDir: ctx.workDir, sidecars });
    if (viaCli) return { files: [viaCli], encoder: "codewalker-cli", warnings };
    warnings.push(`${baseName}.ytd is included as CodeWalker XML with its .dds files — import ${baseName}.ytd.xml with CodeWalker to build the dictionary.`);
    return { files: [{ name: `${baseName}.ytd.xml`, content: Buffer.from(xml, "utf8") }, ...sidecars], encoder: "codewalker-xml", warnings };
  }
  throw new ProcessingError("RAGE_UNSUPPORTED", "This worker cannot write texture dictionaries", { infrastructure: true, retryable: true });
}

/** Human-readable note appended to a resource README when XML fallbacks were used. */
export function encoderReadmeNote(encoder: EncoderKind, xmlFiles: string[]): string {
  if (encoder === "native") return "All RAGE files in this resource were written directly — drop the folder into your server and stream it as-is.";
  if (encoder === "codewalker-cli") return "RAGE files were generated through the CodeWalker converter on our side; they are ready to stream as-is.";
  return [
    "Some files in this resource are CodeWalker XML rather than binary RAGE assets:",
    ...xmlFiles.map((f) => `  - ${f}`),
    "",
    "The game cannot stream the XML directly. To finish them:",
    "  1. Install CodeWalker (https://github.com/dexyfex/CodeWalker).",
    "  2. Open CodeWalker RPF Explorer and use Tools > Import XML on each file listed above.",
    "  3. Save the resulting binary next to the XML (same name without .xml), then delete the .xml.",
    "  4. Make sure fxmanifest.lua lists any new data_file, then restart the resource.",
  ].join("\n");
}
