import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { AssetInput, AssetProcessor, CostEstimate, ProcessingJob, ProcessingResult, ProcessorContext, ValidationResult } from "@modsmith/core";
import type { WorkerReporter } from "../lib/context";
import { ProcessingError } from "../lib/errors";
import { ensureDir, extOf } from "../lib/files";
import { buildGlb, loadModel } from "../lib/gltf";
import { downloadInputs, type DownloadedInputs, type InputFile } from "../lib/inputs";
import { loadRage, type RageDrawable, type RageTexture } from "../lib/rage";
import { renderUvTemplate } from "../lib/thumbnail";
import { extractZip } from "../lib/zip";
import { rageTextureToPng, vramForTexture } from "../lib/textures";
import type { MeshData } from "../lib/mesh";
import { analyzeDirectory } from "./optimizer";
import { alignFace } from "./face";
import { optimizerConfigSchema } from "@modsmith/core";

const OPTIMIZER_TOOLS = new Set(["resource-optimizer", "vehicle-optimizer", "map-optimizer"]);
const RAGE_MODEL_EXTS = ["yft", "ydr", "ydd"];

interface Artifact {
  name: string;
  path: string;
}

/** Flatten a RAGE drawable's high LOD into MeshData for previews and UV templates. */
export function drawableMeshes(drawable: RageDrawable): MeshData[] {
  const out: MeshData[] = [];
  const models = drawable.lods?.high ?? [];
  let index = 0;
  for (const model of models) {
    for (const mesh of model) {
      if (!mesh.positions?.length || !mesh.indices?.length) continue;
      const shader = drawable.shaders?.[mesh.shaderIndex];
      out.push({
        name: `${drawable.name}_${index}`,
        material: shader?.textures?.DiffuseSampler ?? shader?.name ?? `material_${mesh.shaderIndex}`,
        positions: mesh.positions,
        normals: mesh.normals,
        uvs: mesh.uvs?.[0],
        indices: mesh.indices,
      });
      index++;
    }
  }
  return out;
}

/** Primitive indices (in the flattened preview order) per shader, for the editors. */
export function primitiveIndicesByShader(drawable: RageDrawable | null): Map<number, number[]> {
  const map = new Map<number, number[]>();
  if (!drawable) return map;
  let index = 0;
  for (const model of drawable.lods?.high ?? []) {
    for (const mesh of model) {
      if (!mesh.positions?.length || !mesh.indices?.length) continue;
      const list = map.get(mesh.shaderIndex) ?? [];
      list.push(index++);
      map.set(mesh.shaderIndex, list);
    }
  }
  return map;
}

async function stageRageInputs(job: ProcessingJob, inputs: DownloadedInputs): Promise<{ files: { name: string; file: string }[]; dir: string }> {
  const dir = await ensureDir(path.join(job.workDir, "rage"));
  const files: { name: string; file: string }[] = [];
  for (const f of inputs.files) {
    if (f.ext === "zip") {
      const entries = await extractZip(f.file, dir);
      if (entries.some((e) => /\.fxap$/i.test(e))) {
        throw new ProcessingError("ESCROW_PROTECTED", "This resource is protected by FiveM asset escrow (.fxap). Escrowed assets cannot be opened or edited.");
      }
      for (const rel of entries) files.push({ name: path.posix.basename(rel), file: path.join(dir, rel) });
    } else {
      files.push({ name: f.name, file: f.file });
    }
  }
  if (files.some((f) => /\.fxap$/i.test(f.name))) {
    throw new ProcessingError("ESCROW_PROTECTED", "This resource is protected by FiveM asset escrow (.fxap). Escrowed assets cannot be opened or edited.");
  }
  return { files, dir };
}

async function writeArtifact(workDir: string, name: string, content: Buffer | string): Promise<Artifact> {
  const file = path.join(workDir, "artifacts", name);
  await ensureDir(path.dirname(file));
  await writeFile(file, content);
  return { name, path: file };
}

/**
 * Free "inspect" job: converts the user's uploads into editor-loadable previews
 * (preview.glb, materials.json, textures.json + PNGs, uv-template.png, components.json,
 * report.json for optimizers, aligned.png for the face tool).
 */
export const inspectProcessor: AssetProcessor = {
  name: "inspect",

  async validate(input: AssetInput): Promise<ValidationResult> {
    if (!input.files.length && !input.externalRef) {
      return { ok: false, issues: [{ code: "MISSING_INPUT", message: "Nothing was uploaded to inspect.", severity: "error" }] };
    }
    return { ok: true, issues: [] };
  },

  async process(job: ProcessingJob, ctx: ProcessorContext): Promise<ProcessingResult> {
    const reporter = job.reporter as WorkerReporter;
    await reporter.stage("importing", 12, "Downloading your files");
    const inputs = await downloadInputs(job.input, job.workDir, ctx.storage);
    reporter.assertNotCancelled();

    if (OPTIMIZER_TOOLS.has(job.toolSlug)) return inspectOptimizer(job, inputs, reporter);
    if (job.toolSlug === "face-skin-creator") return inspectFace(job, inputs, reporter);

    const glbInput = inputs.first("glb") ?? inputs.first("gltf") ?? inputs.first("obj") ?? inputs.first("dae");
    const rageInput = inputs.files.find((f) => RAGE_MODEL_EXTS.includes(f.ext) || f.ext === "ytd" || f.ext === "zip");
    if (rageInput) return inspectRage(job, inputs, reporter);
    if (glbInput) return inspectModel(job, glbInput, inputs, reporter);
    throw new ProcessingError("UNSUPPORTED_FORMAT", "Upload a model (GLB/OBJ/DAE) or a RAGE file (.yft/.ydr/.ydd/.ytd/.zip) to preview.");
  },

  async estimateCost(): Promise<CostEstimate> {
    return { credits: 0, breakdown: [{ label: "Editor preview", credits: 0 }] };
  },
};

/** GLB/OBJ/DAE path (prop creator, chain creator): pass the geometry through and describe materials. */
async function inspectModel(job: ProcessingJob, model: InputFile, inputs: DownloadedInputs, reporter: WorkerReporter): Promise<ProcessingResult> {
  await reporter.stage("converting", 45, "Building the preview");
  const loaded = await loadModel(model.file, { extraDirs: [inputs.dir] });
  const artifacts: Artifact[] = [];
  const previewBuffer = model.ext === "glb" ? await readFile(model.file) : await buildGlb(loaded.meshes, loaded.materials, { name: path.parse(model.name).name });
  const preview = await writeArtifact(job.workDir, "preview.glb", previewBuffer);

  const materials = loaded.materials.map((m, i) => ({
    name: m.name,
    shader: m.normal ? (m.specular ? "normal_spec" : "normal") : m.specular ? "spec" : "default",
    textures: {
      ...(m.diffuse ? { DiffuseSampler: m.diffuse.name } : {}),
      ...(m.normal ? { BumpSampler: m.normal.name } : {}),
      ...(m.specular ? { SpecSampler: m.specular.name } : {}),
    },
    baseColor: m.baseColor,
    primitiveIndices: loaded.meshes.map((mesh, idx) => (mesh.material === m.name ? idx : -1)).filter((idx) => idx >= 0),
    index: i,
  }));
  artifacts.push(await writeArtifact(job.workDir, "materials.json", JSON.stringify(materials, null, 2)));

  await reporter.stage("textures", 70, "Exporting textures");
  const textures: Record<string, unknown>[] = [];
  for (const m of loaded.materials) {
    for (const slot of [m.diffuse, m.normal, m.specular]) {
      if (!slot?.file || textures.some((t) => t.name === slot.name)) continue;
      const meta = await sharp(slot.file).metadata().catch(() => null);
      const png = await sharp(slot.file).png().toBuffer().catch(() => null);
      if (!png) continue;
      artifacts.push(await writeArtifact(job.workDir, `tex/${slot.name}.png`, png));
      textures.push({ name: slot.name, width: meta?.width ?? 0, height: meta?.height ?? 0, format: "RGBA", mips: 1, artifact: `tex/${slot.name}.png` });
    }
  }
  artifacts.push(await writeArtifact(job.workDir, "textures.json", JSON.stringify(textures, null, 2)));
  if (loaded.meshes.some((m) => m.uvs)) {
    artifacts.push(await writeArtifact(job.workDir, "uv-template.png", await renderUvTemplate(loaded.meshes)));
  }

  await reporter.stage("complete", 99, "Preview ready");
  const triangles = loaded.meshes.reduce((n, m) => n + m.indices.length / 3, 0);
  return {
    ok: true,
    artifact: {
      localPath: preview.path,
      fileName: "preview.glb",
      mime: "model/gltf-binary",
      manifest: {
        stats: { triangles, textures: textures.length, materials: materials.length },
        encoder: "native",
        __extraArtifacts: artifacts,
      },
    },
    facts: { escrow: false, triangles, textureCount: textures.length, materials: materials.map((m) => m.name), format: loaded.format },
  };
}

/** RAGE path (vehicle editor, livery mapper, retexture, clothing): read yft/ydr/ydd/ytd. */
async function inspectRage(job: ProcessingJob, inputs: DownloadedInputs, reporter: WorkerReporter): Promise<ProcessingResult> {
  const rage = await loadRage();
  if (!rage) throw new ProcessingError("RAGE_UNAVAILABLE", "The RAGE codec library is unavailable on this worker", { infrastructure: true, retryable: true });
  const staged = await stageRageInputs(job, inputs);
  const artifacts: Artifact[] = [];

  const yft = staged.files.find((f) => /_hi\.yft$/i.test(f.name) === false && extOf(f.name) === "yft");
  const hiYft = staged.files.find((f) => /_hi\.yft$/i.test(f.name));
  const ydr = staged.files.find((f) => extOf(f.name) === "ydr");
  const ydd = staged.files.find((f) => extOf(f.name) === "ydd");
  const ytdFiles = staged.files.filter((f) => extOf(f.name) === "ytd");
  if (!yft && !ydr && !ydd && !ytdFiles.length) {
    throw new ProcessingError("MISSING_INPUT", "No .yft, .ydr, .ydd or .ytd file was found in the upload.");
  }

  await reporter.stage("converting", 40, "Reading the model");
  let drawable: RageDrawable | null = null;
  let components: { name: string; boneIndex: number; primitiveIndices: number[] }[] = [];
  let modelName = "model";
  if (yft && rage.readYft) {
    const fragment = rage.readYft(await readFile(yft.file));
    drawable = fragment.drawable;
    modelName = fragment.name || path.parse(yft.name).name;
    let cursor = drawableMeshes(drawable).length;
    components = fragment.children.map((c) => {
      const count = c.drawable ? drawableMeshes(c.drawable).length : 0;
      const indices = Array.from({ length: count }, (_, i) => cursor + i);
      cursor += count;
      return { name: c.name, boneIndex: c.boneIndex, primitiveIndices: indices };
    });
  } else if (ydr && rage.readYdr) {
    drawable = rage.readYdr(await readFile(ydr.file));
    modelName = drawable.name || path.parse(ydr.name).name;
  } else if (ydd && rage.readYdd) {
    const dict = rage.readYdd(await readFile(ydd.file));
    drawable = dict[0]?.drawable ?? null;
    modelName = dict[0]?.name ?? path.parse(ydd.name).name;
  }

  await reporter.stage("textures", 62, "Exporting textures");
  const rageTextures: RageTexture[] = [];
  for (const f of ytdFiles) {
    if (!rage.readYtd) break;
    try {
      rageTextures.push(...rage.readYtd(await readFile(f.file)));
    } catch (err) {
      reporter.warn(`${f.name} could not be read (${(err as Error).message}).`);
    }
  }
  const textures: Record<string, unknown>[] = [];
  for (const t of rageTextures) {
    const png = await rageTextureToPng(t).catch(() => null);
    if (png) artifacts.push(await writeArtifact(job.workDir, `tex/${t.name}.png`, png));
    textures.push({
      name: t.name,
      width: t.width,
      height: t.height,
      format: t.format,
      mips: t.mipLevels,
      vramBytes: vramForTexture(t.width, t.height, t.format, t.mipLevels),
      artifact: png ? `tex/${t.name}.png` : undefined,
    });
  }
  artifacts.push(await writeArtifact(job.workDir, "textures.json", JSON.stringify(textures, null, 2)));

  const primitives = primitiveIndicesByShader(drawable);
  const materials = (drawable?.shaders ?? []).map((s, i) => ({
    name: s.textures?.DiffuseSampler ?? `${s.name}_${i}`,
    shader: s.name,
    textures: s.textures ?? {},
    primitiveIndices: primitives.get(i) ?? [],
    index: i,
  }));
  artifacts.push(await writeArtifact(job.workDir, "materials.json", JSON.stringify(materials, null, 2)));
  if (components.length) artifacts.push(await writeArtifact(job.workDir, "components.json", JSON.stringify(components, null, 2)));

  await reporter.stage("converting", 80, "Building the preview");
  let previewBuffer: Buffer | null = null;
  if (drawable && rage.drawableToGlb) {
    try {
      previewBuffer = rage.drawableToGlb(drawable, rageTextures);
    } catch (err) {
      reporter.warn(`The GLB preview could not be produced by the codec (${(err as Error).message}); falling back to raw geometry.`);
    }
  }
  const meshes = drawable ? drawableMeshes(drawable) : [];
  if (!previewBuffer && meshes.length) {
    previewBuffer = await buildGlb(meshes, materials.map((m) => ({ name: m.name, baseColor: [0.8, 0.8, 0.8, 1] as [number, number, number, number], metallic: 0, roughness: 0.6 })), { name: modelName });
  }
  if (!previewBuffer) {
    if (!ytdFiles.length) throw new ProcessingError("PREVIEW_FAILED", "The model could not be converted into a preview. Please check the file is an unlocked (non-escrow) FiveM asset.");
    // Texture-only upload (e.g. retexture of a .ytd): still a useful preview payload.
    previewBuffer = Buffer.from("");
  }
  const preview = await writeArtifact(job.workDir, "preview.glb", previewBuffer);

  if (meshes.some((m) => m.uvs)) {
    const target = job.toolSlug === "livery-mapper"
      ? meshes.filter((m) => /body|sign|livery|paint/i.test(m.material)).concat(meshes).slice(0, Math.max(1, meshes.filter((m) => /body|sign|livery|paint/i.test(m.material)).length))
      : meshes;
    artifacts.push(await writeArtifact(job.workDir, "uv-template.png", await renderUvTemplate(target.length ? target : meshes)));
  }

  await reporter.stage("complete", 99, "Preview ready");
  const triangles = meshes.reduce((n, m) => n + m.indices.length / 3, 0);
  return {
    ok: true,
    artifact: {
      localPath: preview.path,
      fileName: "preview.glb",
      mime: "model/gltf-binary",
      manifest: {
        stats: { triangles, textures: textures.length, materials: materials.length, components: components.length },
        encoder: "native",
        __extraArtifacts: artifacts,
      },
    },
    facts: {
      escrow: false,
      vehicleName: modelName,
      hasHiLod: !!hiYft,
      textureCount: textures.length,
      triangles,
      components: components.map((c) => c.name),
      variants: textures.map((t) => t.name),
    },
  };
}

/** Optimizer tools: the inspect job IS the analysis. */
async function inspectOptimizer(job: ProcessingJob, inputs: DownloadedInputs, reporter: WorkerReporter): Promise<ProcessingResult> {
  const dir = await ensureDir(path.join(job.workDir, "resource"));
  const zip = inputs.first("zip");
  if (zip) {
    const entries = await extractZip(zip.file, dir);
    if (entries.some((e) => /\.fxap$/i.test(e))) throw new ProcessingError("ESCROW_PROTECTED", "This resource is protected by FiveM asset escrow (.fxap) and cannot be analysed.");
  } else {
    for (const f of inputs.files) await writeFile(path.join(dir, f.name), await readFile(f.file));
  }
  await reporter.stage("optimizing", 55, "Analysing the resource");
  const cfg = optimizerConfigSchema.partial().safeParse(job.input.config);
  const kind = job.toolSlug === "vehicle-optimizer" ? "vehicle" : job.toolSlug === "map-optimizer" ? "map" : (cfg.success && cfg.data.kind) || "general";
  const maxTextureSize = (cfg.success && cfg.data.maxTextureSize) || 2048;
  const report = await analyzeDirectory(dir, { kind, maxTextureSize });
  const reportPath = path.join(job.workDir, "report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await reporter.stage("complete", 99, "Analysis ready");
  return {
    ok: true,
    artifact: {
      localPath: reportPath,
      fileName: "report.json",
      mime: "application/json",
      manifest: { stats: { files: report.files.length, issues: report.issues.length, vramBytes: report.estimatedVramBytes }, report, encoder: "native" },
    },
    facts: { kind, issues: report.issues.length, vramBytes: report.estimatedVramBytes, totalBytes: report.totalBytes },
  };
}

/** Face tool: auto-align the uploaded photo and report the detected face box. */
async function inspectFace(job: ProcessingJob, inputs: DownloadedInputs, reporter: WorkerReporter): Promise<ProcessingResult> {
  const photo = inputs.first("png", "jpg", "jpeg", "webp");
  if (!photo) throw new ProcessingError("MISSING_INPUT", "Upload a photo (PNG or JPG) to align.");
  await reporter.stage("converting", 55, "Aligning the photo");
  const aligned = await alignFace(await readFile(photo.file));
  const file = path.join(job.workDir, "aligned.png");
  await writeFile(file, aligned.png);
  await reporter.stage("complete", 99, "Alignment ready");
  return {
    ok: true,
    artifact: {
      localPath: file,
      fileName: "aligned.png",
      mime: "image/png",
      manifest: { stats: { width: aligned.size, height: aligned.size }, encoder: "native" },
    },
    facts: { faceBox: aligned.box, method: aligned.method },
  };
}
