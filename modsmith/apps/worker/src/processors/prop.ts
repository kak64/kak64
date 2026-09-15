import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { AssetInput, AssetProcessor, CostEstimate, ProcessingJob, ProcessingResult, ProcessorContext, ValidationResult } from "@modsmith/core";
import { propConfigSchema } from "@modsmith/core";
import { ProcessingError } from "../lib/errors";
import { buildGlb, buildLods, loadModel, ratioForTarget, simplifyMeshes } from "../lib/gltf";
import { downloadInputs, MODEL_EXTS, type DownloadedInputs } from "../lib/inputs";
import { propManifest } from "../lib/manifest";
import { computeBounds, mat4Compose, mergeMeshes, transformMesh, triangleCount, type MaterialData, type MeshData } from "../lib/mesh";
import { combineEncoders, encodeBound, encodeDrawable, encodeTextureDictionary, encodeYtyp, encoderReadmeNote, type EncoderKind } from "../lib/rage-convert";
import { buildCredits, buildReadme, createResourceBuilder, type ResourceBuilder } from "../lib/resource";
import { detectTextureRole, prepareTexture, sanitizeTextureName, solidColorRgba, encodeDds, vramForTexture, type PreparedTexture } from "../lib/textures";
import { renderMeshThumbnail, textureThumbnail } from "../lib/thumbnail";
import type { BuildMesh, BuildShader, DrawableBuild } from "../lib/rage";
import { safeName } from "../lib/files";
import type { WorkerReporter } from "../lib/context";

type PropConfig = ReturnType<typeof propConfigSchema.parse>;

export interface ShaderPlan {
  shaders: BuildShader[];
  textures: PreparedTexture[];
  /** material name → shader index */
  materialIndex: Map<string, number>;
}

/** Choose the RAGE shader for a material from the maps it actually has. */
export function shaderForMaps(hasNormal: boolean, hasSpec: boolean): string {
  if (hasNormal && hasSpec) return "normal_spec";
  if (hasNormal) return "normal";
  if (hasSpec) return "spec";
  return "default";
}

/**
 * Convert glTF-style materials into RAGE shaders plus the DDS textures that back them.
 * Every material gets a diffuse texture (a flat colour swatch when it has no map), because
 * RAGE shaders always sample DiffuseSampler.
 */
export async function planShaders(
  materials: MaterialData[],
  opts: { prefix: string; maxTextureSize: number; overrides?: Map<string, { baseColor?: string; normal?: string; roughness?: string; metalness?: string; color?: string }>; resolve?: (ref: string) => string | undefined },
): Promise<ShaderPlan> {
  const shaders: BuildShader[] = [];
  const textures: PreparedTexture[] = [];
  const materialIndex = new Map<string, number>();
  const seen = new Map<string, PreparedTexture>();

  const addTexture = async (source: string | Buffer, name: string, role: ReturnType<typeof detectTextureRole>) => {
    const key = sanitizeTextureName(name);
    const existing = seen.get(key);
    if (existing) return existing;
    const prepared = await prepareTexture(source, key, { maxSize: opts.maxTextureSize, role });
    seen.set(key, prepared);
    textures.push(prepared);
    return prepared;
  };

  for (const mat of materials) {
    const slug = safeName(mat.name, "material");
    const override = opts.overrides?.get(mat.name);
    const pick = (ref: string | undefined, fallback?: { file?: string; buffer?: Buffer }) => {
      if (ref && opts.resolve) {
        const resolved = opts.resolve(ref);
        if (resolved) return { file: resolved };
      }
      return fallback;
    };
    const diffuseSource = pick(override?.baseColor, mat.diffuse ? { file: mat.diffuse.file, buffer: mat.diffuse.buffer } : undefined);
    const normalSource = pick(override?.normal, mat.normal ? { file: mat.normal.file, buffer: mat.normal.buffer } : undefined);
    const specSource = pick(override?.roughness ?? override?.metalness, mat.specular ? { file: mat.specular.file, buffer: mat.specular.buffer } : mat.roughnessMap ? { file: mat.roughnessMap.file, buffer: mat.roughnessMap.buffer } : undefined);

    let diffuse: PreparedTexture;
    if (diffuseSource?.file || diffuseSource?.buffer) {
      diffuse = await addTexture((diffuseSource.file ?? diffuseSource.buffer)!, `${opts.prefix}_${slug}`, "diffuse");
    } else {
      const rgb = override?.color ?? rgbToHex(mat.baseColor);
      const swatch = await solidColorRgba(rgb, 64, Math.round((mat.baseColor[3] ?? 1) * 255));
      const dds = await encodeDds(swatch, mat.baseColor[3] < 1 ? "DXT5" : "DXT1", true);
      const name = sanitizeTextureName(`${opts.prefix}_${slug}`);
      diffuse = { name, role: "diffuse", width: swatch.width, height: swatch.height, format: mat.baseColor[3] < 1 ? "DXT5" : "DXT1", mips: 7, dds, vramBytes: vramForTexture(64, 64, "DXT1", 7) };
      if (!seen.has(name)) {
        seen.set(name, diffuse);
        textures.push(diffuse);
      }
    }
    const normal = normalSource?.file || normalSource?.buffer ? await addTexture((normalSource.file ?? normalSource.buffer)!, `${opts.prefix}_${slug}_n`, "normal") : undefined;
    const spec = specSource?.file || specSource?.buffer ? await addTexture((specSource.file ?? specSource.buffer)!, `${opts.prefix}_${slug}_s`, "spec") : undefined;

    const shaderTextures: Record<string, string> = { DiffuseSampler: diffuse.name };
    if (normal) shaderTextures.BumpSampler = normal.name;
    if (spec) shaderTextures.SpecSampler = spec.name;
    materialIndex.set(mat.name, shaders.length);
    shaders.push({ name: shaderForMaps(!!normal, !!spec), textures: shaderTextures });
  }
  if (!shaders.length) {
    const swatch = await solidColorRgba("#c8c8c8", 64);
    const dds = await encodeDds(swatch, "DXT1", true);
    const name = sanitizeTextureName(`${opts.prefix}_default`);
    textures.push({ name, role: "diffuse", width: 64, height: 64, format: "DXT1", mips: 7, dds, vramBytes: vramForTexture(64, 64, "DXT1", 7) });
    shaders.push({ name: "default", textures: { DiffuseSampler: name } });
    materialIndex.set("default", 0);
  }
  return { shaders, textures, materialIndex };
}

function rgbToHex(c: [number, number, number, number]): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, "0");
  return `#${to(c[0])}${to(c[1])}${to(c[2])}`;
}

export function meshesToDrawableInput(meshes: MeshData[], materialIndex: Map<string, number>): BuildMesh[] {
  return meshes.map((m) => ({
    name: m.name,
    shaderIndex: materialIndex.get(m.material) ?? 0,
    positions: m.positions,
    normals: m.normals,
    uvs: m.uvs,
    colors: m.colors,
    indices: m.indices,
  }));
}

export const SPAWN_SCRIPT = (propName: string) => `-- ${propName} spawn helper (generated by Modsmith)
local model = \`${propName}\`
local spawned = {}

local function loadModel()
    if not IsModelInCdimage(model) then return false end
    RequestModel(model)
    local timeout = GetGameTimer() + 10000
    while not HasModelLoaded(model) and GetGameTimer() < timeout do Wait(10) end
    return HasModelLoaded(model)
end

--- Spawns the prop in front of the player and returns the entity handle.
local function spawn(coords, heading, frozen)
    if not loadModel() then
        print('[${propName}] model failed to load — is the resource streamed?')
        return nil
    end
    local ped = PlayerPedId()
    coords = coords or GetOffsetFromEntityInWorldCoords(ped, 0.0, 1.5, 0.0)
    local obj = CreateObject(model, coords.x, coords.y, coords.z, true, true, false)
    PlaceObjectOnGroundProperly(obj)
    SetEntityHeading(obj, heading or GetEntityHeading(ped))
    FreezeEntityPosition(obj, frozen ~= false)
    SetModelAsNoLongerNeeded(model)
    spawned[#spawned + 1] = obj
    return obj
end

exports('spawn', spawn)

RegisterCommand('spawnprop', function(_, args)
    if args[1] and args[1] ~= '${propName}' then return end
    local obj = spawn()
    if obj then print(('[${propName}] spawned entity %s'):format(obj)) end
end, false)

RegisterCommand('deleteprops', function()
    for i = #spawned, 1, -1 do
        if DoesEntityExist(spawned[i]) then DeleteEntity(spawned[i]) end
        spawned[i] = nil
    end
end, false)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    for i = #spawned, 1, -1 do
        if DoesEntityExist(spawned[i]) then DeleteEntity(spawned[i]) end
    end
end)
`;

export interface PropBuildResult {
  builder: ResourceBuilder;
  encoder: EncoderKind;
  warnings: string[];
  stats: Record<string, unknown>;
  lodMeshes: MeshData[];
  textures: PreparedTexture[];
}

export interface PropBuildOptions {
  propName: string;
  meshes: MeshData[];
  materials: MaterialData[];
  config: Pick<PropConfig, "collision" | "lods" | "decimation" | "targetTriangles" | "spawnScript" | "attribution">;
  workDir: string;
  reporter: WorkerReporter;
  resolveTexture?: (ref: string) => string | undefined;
  materialOverrides?: Map<string, { baseColor?: string; normal?: string; roughness?: string; metalness?: string; color?: string }>;
  extraReadme?: { usage?: string[]; notes?: string[] };
  clientScripts?: { path: string; content: string }[];
}

/**
 * Shared prop pipeline: LODs → shaders/textures → collision → .ydr/.ytd/.ybn/.ytyp →
 * fxmanifest + scripts + README. Used by the prop creator and the chain (accessory) creator.
 */
export async function buildPropResource(opts: PropBuildOptions): Promise<PropBuildResult> {
  const { propName, config, reporter, workDir } = opts;
  const warnings: string[] = [];
  const encoders: EncoderKind[] = [];
  const ctx = { workDir };

  await reporter.stage("optimizing", 40, "Decimating geometry");
  const targetRatio = Math.min(config.decimation, ratioForTarget(opts.meshes, config.targetTriangles));
  const baseMeshes = await simplifyMeshes(opts.meshes, targetRatio);
  reporter.assertNotCancelled();

  await reporter.stage("lods", 50, config.lods.auto ? "Generating LODs" : "Building the high LOD");
  const lods = await buildLods(baseMeshes, config.lods, config.lods.auto);
  reporter.assertNotCancelled();

  await reporter.stage("textures", 62, "Converting textures");
  const plan = await planShaders(opts.materials, { prefix: propName, maxTextureSize: 2048, overrides: opts.materialOverrides, resolve: opts.resolveTexture });
  reporter.assertNotCancelled();

  const builder = await createResourceBuilder(propName, workDir);
  const bounds = computeBounds(lods.high);

  const drawable: DrawableBuild = {
    name: propName,
    shaders: plan.shaders,
    lods: {
      high: meshesToDrawableInput(lods.high, plan.materialIndex),
      med: lods.med ? meshesToDrawableInput(lods.med, plan.materialIndex) : undefined,
      low: lods.low ? meshesToDrawableInput(lods.low, plan.materialIndex) : undefined,
      vlow: lods.vlow ? meshesToDrawableInput(lods.vlow, plan.materialIndex) : undefined,
    },
    lodDistances: config.lods.distances,
    bounds: { min: bounds.min, max: bounds.max, center: bounds.center, radius: bounds.radius },
  };

  await reporter.stage("converting", 72, "Writing the drawable");
  const ydr = await encodeDrawable(drawable, propName, ctx);
  encoders.push(ydr.encoder);
  warnings.push(...ydr.warnings);
  for (const f of ydr.files) await builder.addFile(`stream/${f.name}`, f.content);

  const ytd = await encodeTextureDictionary(plan.textures.map((t) => ({ name: t.name, dds: t.dds })), propName, ctx);
  encoders.push(ytd.encoder);
  warnings.push(...ytd.warnings);
  for (const f of ytd.files) await builder.addFile(`stream/${f.name}`, f.content);

  let collisionTriangles = 0;
  if (config.collision !== "none") {
    await reporter.stage("collision", 80, `Building ${config.collision} collision`);
    if (config.collision === "box") {
      const bound = await encodeBound({ type: "box", name: propName, bounds: { min: bounds.min, max: bounds.max, center: bounds.center, radius: bounds.radius } }, propName, ctx);
      encoders.push(bound.encoder);
      warnings.push(...bound.warnings);
      for (const f of bound.files) await builder.addFile(`stream/${f.name}`, f.content);
    } else {
      const merged = mergeMeshes(lods.low ?? lods.high, `${propName}_col`);
      const simplified = triangleCount([merged]) > 5000 ? (await simplifyMeshes([merged], 5000 / triangleCount([merged])))[0]! : merged;
      collisionTriangles = triangleCount([simplified]);
      const bound = await encodeBound(
        { type: "mesh", name: propName, bounds: { min: bounds.min, max: bounds.max, center: bounds.center, radius: bounds.radius }, positions: simplified.positions, indices: simplified.indices },
        propName,
        ctx,
      );
      encoders.push(bound.encoder);
      warnings.push(...bound.warnings);
      for (const f of bound.files) await builder.addFile(`stream/${f.name}`, f.content);
    }
  }

  const ytyp = await encodeYtyp(
    {
      name: propName,
      archetypes: [
        {
          name: propName,
          textureDictionary: propName,
          physicsDictionary: config.collision === "none" ? undefined : propName,
          bounds: { min: bounds.min, max: bounds.max, center: bounds.center, radius: bounds.radius },
          lodDist: config.lods.distances[3],
          flags: 32,
        },
      ],
    },
    propName,
    ctx,
  );
  encoders.push(ytyp.encoder);
  warnings.push(...ytyp.warnings);
  let ytypFile: string | undefined;
  for (const f of ytyp.files) {
    await builder.addFile(`stream/${f.name}`, f.content);
    if (f.name.endsWith(".ytyp")) ytypFile = `stream/${f.name}`;
  }
  if (!ytypFile && ytyp.files.length) warnings.push("The .ytyp is included as CodeWalker XML and is not referenced by fxmanifest.lua until you convert it.");

  await reporter.stage("packaging", 88, "Packaging the resource");
  const clientScripts: string[] = [];
  if (config.spawnScript) {
    await builder.addFile("client/spawn.lua", SPAWN_SCRIPT(propName));
    clientScripts.push("client/spawn.lua");
  }
  for (const extra of opts.clientScripts ?? []) {
    await builder.addFile(extra.path, extra.content);
    clientScripts.push(extra.path);
  }
  await builder.addFile("fxmanifest.lua", propManifest({ resourceName: propName, ytypFile, clientScripts }));

  const encoder = combineEncoders(encoders);
  const xmlFallbacks = builder.xmlFallbacks;
  await builder.addFile(
    "README.md",
    buildReadme({
      title: `${propName} — FiveM prop`,
      resourceName: propName,
      intro: `A streaming-ready prop built from your model. Spawn name: \`${propName}\`.`,
      usage: [
        ...(config.spawnScript ? [`In game: \`/spawnprop\` places the prop in front of you; \`/deleteprops\` clears the ones you spawned.`, `From another resource: \`exports['${propName}']:spawn(coords, heading, frozen)\`.`] : []),
        `Map editors: search for the archetype \`${propName}\`.`,
      ],
      warnings: xmlFallbacks.length ? [encoderReadmeNote(encoder, xmlFallbacks)] : undefined,
      notes: [
        `Triangles: ${triangleCount(lods.high)} (high LOD)`,
        `Textures: ${plan.textures.length}`,
        `Collision: ${config.collision}`,
        ...(opts.extraReadme?.notes ?? []),
      ],
      credits: config.attribution,
    }),
  );
  if (config.attribution) await builder.addFile("CREDITS.txt", buildCredits(config.attribution));

  const vramBytes = plan.textures.reduce((n, t) => n + t.vramBytes, 0);
  const stats: Record<string, unknown> = {
    triangles: triangleCount(lods.high),
    trianglesByLod: {
      high: triangleCount(lods.high),
      med: lods.med ? triangleCount(lods.med) : 0,
      low: lods.low ? triangleCount(lods.low) : 0,
      vlow: lods.vlow ? triangleCount(lods.vlow) : 0,
    },
    textures: plan.textures.length,
    vramBytes,
    lods: 1 + (lods.med ? 1 : 0) + (lods.low ? 1 : 0) + (lods.vlow ? 1 : 0),
    collision: config.collision,
    collisionTriangles,
  };
  return { builder, encoder, warnings, stats, lodMeshes: lods.high, textures: plan.textures };
}

async function loadPropModel(inputs: DownloadedInputs) {
  const model = inputs.first("glb") ?? inputs.first("gltf") ?? inputs.first("obj") ?? inputs.first("dae");
  if (!model) {
    const fbx = inputs.first("fbx");
    if (fbx) {
      throw new ProcessingError("UNSUPPORTED_FORMAT", "FBX files must be normalized to GLB by the editor before export. Re-open the model in the Prop Creator and export again.");
    }
    throw new ProcessingError("MISSING_INPUT", "No model file was uploaded. Upload a GLB, glTF, OBJ or DAE file.");
  }
  return { model, loaded: await loadModel(model.file, { extraDirs: [inputs.dir] }) };
}

export const propProcessor: AssetProcessor = {
  name: "prop",

  async validate(input: AssetInput): Promise<ValidationResult> {
    const issues: ValidationResult["issues"] = [];
    const hasModel = input.files.some((f) => MODEL_EXTS.includes((f.originalName ?? f.key).split(".").pop()?.toLowerCase() ?? ""));
    if (!hasModel) issues.push({ code: "MISSING_INPUT", message: "Upload a model file (GLB, glTF, OBJ or DAE).", severity: "error" });
    const parsed = propConfigSchema.safeParse(input.config);
    if (!parsed.success) {
      issues.push({ code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid prop configuration", severity: "error" });
    }
    return { ok: !issues.some((i) => i.severity === "error"), issues };
  },

  async process(job: ProcessingJob, ctx: ProcessorContext): Promise<ProcessingResult> {
    const reporter = job.reporter as WorkerReporter;
    const config = propConfigSchema.parse(job.input.config);
    const propName = safeName(config.propName, "modsmith_prop");

    await reporter.stage("importing", 10, "Downloading your files");
    const inputs = await downloadInputs(job.input, job.workDir, ctx.storage);
    reporter.assertNotCancelled();

    const { loaded } = await loadPropModel(inputs);
    await reporter.log(`Loaded ${loaded.format.toUpperCase()} model: ${triangleCount(loaded.meshes)} triangles, ${loaded.materials.length} materials`);

    await reporter.stage("converting", 28, "Applying transform");
    const matrix = mat4Compose(config.position, config.rotation, config.scale);
    const meshes = loaded.meshes.map((m) => transformMesh(m, matrix));

    const overrides = new Map<string, { baseColor?: string; normal?: string; roughness?: string; metalness?: string; color?: string }>();
    for (const m of config.materials) overrides.set(m.name, { baseColor: m.baseColor, normal: m.normal, roughness: m.roughness, metalness: m.metalness, color: m.color });

    const built = await buildPropResource({
      propName,
      meshes,
      materials: loaded.materials,
      config,
      workDir: job.workDir,
      reporter,
      materialOverrides: overrides,
      resolveTexture: (ref) => inputs.resolve(ref)?.file,
    });

    const zipPath = path.join(job.workDir, `${propName}.zip`);
    await built.builder.writeZip(zipPath);

    // Thumbnail: rendered mesh preview, falling back to the first diffuse texture.
    let thumbnailPath: string | undefined;
    const png = await renderMeshThumbnail(built.lodMeshes).catch(() => null);
    if (png) {
      thumbnailPath = path.join(job.workDir, "thumbnail.png");
      await writeFile(thumbnailPath, png);
    } else {
      const firstDiffuse = loaded.materials.find((m) => m.diffuse?.file)?.diffuse?.file;
      if (firstDiffuse) {
        thumbnailPath = path.join(job.workDir, "thumbnail.png");
        await writeFile(thumbnailPath, await textureThumbnail(firstDiffuse));
      }
    }

    // Editor preview so the creation can be re-opened without re-uploading.
    const previewPath = path.join(job.workDir, "preview.glb");
    await writeFile(previewPath, await buildGlb(built.lodMeshes, loaded.materials, { name: propName }));

    await reporter.stage("complete", 99, "Done");
    return {
      ok: true,
      artifact: {
        localPath: zipPath,
        fileName: `${propName}.zip`,
        mime: "application/zip",
        thumbnailPath,
        previewPath,
        manifest: {
          files: built.builder.files,
          stats: built.stats,
          warnings: built.warnings,
          encoder: built.encoder,
        },
      },
      facts: { propName, triangles: built.stats.triangles, textures: built.stats.textures, encoder: built.encoder },
    };
  },

  async estimateCost(input: AssetInput, ctx: ProcessorContext): Promise<CostEstimate> {
    const config = propConfigSchema.safeParse(input.config);
    const lodCount = config.success && config.data.lods.auto ? 4 : 1;
    const breakdown = [{ label: "Prop export", credits: ctx.baseCost }];
    return { credits: ctx.baseCost, breakdown: lodCount > 1 ? breakdown : breakdown };
  },
};
