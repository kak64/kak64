import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createZip, type ZipInputFile } from "./zip";
import { fileSize } from "./files";

export interface ResourceFileEntry {
  /** Path inside the ZIP, relative to the resource folder. */
  path: string;
  size: number;
}

/**
 * Accumulates the files of a FiveM resource and packages them into a ZIP whose
 * single top-level folder is the resource name (drag-and-drop into `resources/`).
 */
export class ResourceBuilder {
  private entries: ZipInputFile[] = [];
  private listing: ResourceFileEntry[] = [];

  constructor(
    readonly resourceName: string,
    private readonly stageDir: string,
  ) {}

  /** Add an in-memory file. */
  async addFile(relPath: string, content: Buffer | string): Promise<void> {
    const rel = relPath.replace(/^\/+/, "");
    const abs = path.join(this.stageDir, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content);
    this.entries.push({ name: path.posix.join(this.resourceName, rel), file: abs });
    this.listing.push({ path: path.posix.join(this.resourceName, rel), size: Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content) });
  }

  /** Add an existing local file without copying it. */
  async addLocal(relPath: string, localFile: string): Promise<void> {
    const rel = relPath.replace(/^\/+/, "");
    this.entries.push({ name: path.posix.join(this.resourceName, rel), file: localFile });
    this.listing.push({ path: path.posix.join(this.resourceName, rel), size: await fileSize(localFile) });
  }

  has(relPath: string): boolean {
    const target = path.posix.join(this.resourceName, relPath.replace(/^\/+/, ""));
    return this.listing.some((l) => l.path === target);
  }

  get files(): ResourceFileEntry[] {
    return [...this.listing].sort((a, b) => a.path.localeCompare(b.path));
  }

  get totalBytes(): number {
    return this.listing.reduce((n, f) => n + f.size, 0);
  }

  /** Paths (relative to the resource root) that are CodeWalker XML fallbacks. */
  get xmlFallbacks(): string[] {
    const prefix = `${this.resourceName}/`;
    return this.listing.filter((l) => /\.(ydr|ytd|ybn|ytyp|yft)\.xml$/i.test(l.path)).map((l) => l.path.slice(prefix.length));
  }

  async writeZip(outFile: string): Promise<{ file: string; entries: number }> {
    const { entries } = await createZip(outFile, this.entries);
    return { file: outFile, entries };
  }
}

export async function createResourceBuilder(resourceName: string, workDir: string): Promise<ResourceBuilder> {
  const stage = path.join(workDir, "stage", resourceName);
  await mkdir(stage, { recursive: true });
  return new ResourceBuilder(resourceName, stage);
}

/** Standard README shipped with every resource. */
export function buildReadme(opts: {
  title: string;
  resourceName: string;
  intro?: string;
  install?: string[];
  usage?: string[];
  notes?: string[];
  credits?: { model?: string; author?: string; license?: string; sourceUrl?: string };
  warnings?: string[];
}): string {
  const lines: string[] = [];
  lines.push(`# ${opts.title}`, "");
  if (opts.intro) lines.push(opts.intro, "");
  lines.push("## Install", "");
  const install = opts.install ?? [
    `Copy the \`${opts.resourceName}\` folder into your server's \`resources\` directory.`,
    `Add \`ensure ${opts.resourceName}\` to your \`server.cfg\`.`,
    "Restart the server (or `refresh` then `ensure`).",
  ];
  install.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  lines.push("");
  if (opts.usage?.length) {
    lines.push("## Usage", "");
    for (const u of opts.usage) lines.push(`- ${u}`);
    lines.push("");
  }
  if (opts.warnings?.length) {
    lines.push("## Important", "");
    for (const w of opts.warnings) lines.push(`- ${w}`);
    lines.push("");
  }
  if (opts.notes?.length) {
    lines.push("## Notes", "");
    for (const n of opts.notes) lines.push(`- ${n}`);
    lines.push("");
  }
  if (opts.credits && (opts.credits.author || opts.credits.model)) {
    lines.push("## Credits", "");
    if (opts.credits.model) lines.push(`- Model: ${opts.credits.model}`);
    if (opts.credits.author) lines.push(`- Author: ${opts.credits.author}`);
    if (opts.credits.license) lines.push(`- License: ${opts.credits.license}`);
    if (opts.credits.sourceUrl) lines.push(`- Source: ${opts.credits.sourceUrl}`);
    lines.push("");
  }
  lines.push("---", "", "Built with Modsmith — https://modsmith.app", "");
  return lines.join("\n");
}

export function buildCredits(attribution: { model: string; author: string; license: string; sourceUrl: string }): string {
  return [
    "This resource includes third-party content.",
    "",
    `Model:   ${attribution.model}`,
    `Author:  ${attribution.author}`,
    `License: ${attribution.license}`,
    `Source:  ${attribution.sourceUrl}`,
    "",
    "Keep this file with the resource — the license above requires attribution.",
    "",
  ].join("\n");
}
