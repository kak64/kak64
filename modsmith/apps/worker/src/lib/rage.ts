/**
 * Adapter around `@modsmith/rage`.
 *
 * The rage package is explicitly tiered (its `CAPABILITIES` export is the source of
 * truth): `.ytd`, DDS and RSC7 are native read/write, while the drawable and bound
 * writers emit a layout that has not been verified against retail files and are therefore
 * treated as XML-only. Everything here reads `CAPABILITIES` at runtime so the worker
 * upgrades itself the moment a writer is promoted to `native`, and never claims a native
 * file it did not actually write.
 */
import * as rage from "@modsmith/rage";
import type {
  BoundInput as RageBoundInput,
  DrawableInput as RageDrawableInput,
  DrawableMeshInput,
  LodLevel,
  RageBound,
  RageBounds,
  RageDrawable,
  RageFragment,
  RageMesh,
  RageShader,
  RageTexture,
  WritableShaderName,
  YtypArchetype,
  YtypInput as RageYtypInput,
} from "@modsmith/rage";

export type {
  DrawableMeshInput,
  LodLevel,
  RageBound,
  RageBoundInput,
  RageBounds,
  RageDrawable,
  RageDrawableInput,
  RageFragment,
  RageMesh,
  RageShader,
  RageTexture,
  RageYtypInput,
  WritableShaderName,
  YtypArchetype,
};

export type DdsFormat = "DXT1" | "DXT5" | "A8R8G8B8";

/** Optional members are probed at runtime: the package grows writers over time. */
export interface RageModule {
  parseRsc7?: typeof rage.parseRsc7;
  isRsc7?: typeof rage.isRsc7;
  readYtd?: typeof rage.readYtd;
  writeYtd?: typeof rage.writeYtd;
  readYdr?: typeof rage.readYdr;
  writeYdr?: typeof rage.writeYdr;
  readYdd?: typeof rage.readYdd;
  writeYdd?: typeof rage.writeYdd;
  readYft?: typeof rage.readYft;
  /** Not implemented by the package yet; probed so the worker uses it when it lands. */
  writeYft?: (input: RageDrawableInput) => Buffer;
  readYbn?: typeof rage.readYbn;
  writeYbn?: typeof rage.writeYbn;
  /** Not implemented by the package yet (ytyp is XML + CodeWalker today). */
  writeYtyp?: (input: RageYtypInput) => Buffer;
  ydrXml?: typeof rage.ydrXml;
  ytdXml?: typeof rage.ytdXml;
  ybnXml?: typeof rage.ybnXml;
  ytypXml?: typeof rage.ytypXml;
  drawableToGlb?: typeof rage.drawableToGlb;
  encodeDds?: typeof rage.encodeDds;
  decodeDds?: typeof rage.decodeDds;
  encodePng?: typeof rage.encodePng;
  CAPABILITIES?: typeof rage.CAPABILITIES;
}

export type CapabilityLevel = "native" | "xml-only" | "read-only" | "none";

/** The worker's view of what the codec can do right now. */
export interface RageCapabilities {
  rsc7: CapabilityLevel;
  ytd: CapabilityLevel;
  dds: CapabilityLevel;
  ydr: CapabilityLevel;
  ybn: CapabilityLevel;
  ydd: CapabilityLevel;
  yft: CapabilityLevel;
  glb: CapabilityLevel;
  xml: CapabilityLevel;
  /** Writers that may be used to produce shippable binaries. */
  writeYtd: boolean;
  writeYdr: boolean;
  writeYbn: boolean;
  writeYft: boolean;
  writeYtyp: boolean;
}

const mod: RageModule = rage as unknown as RageModule;
let override: RageModule | null = null;

function current(): RageModule {
  return override ?? mod;
}

function level(value: unknown, fallback: CapabilityLevel = "none"): CapabilityLevel {
  return value === "native" || value === "xml-only" || value === "read-only" ? value : fallback;
}

/** Read CAPABILITIES (the package's own declaration) and derive which writers we may ship. */
export function capabilitiesOf(m: RageModule): RageCapabilities {
  const caps = (m.CAPABILITIES ?? {}) as Record<string, unknown>;
  const ytd = level(caps.ytd, typeof m.writeYtd === "function" ? "native" : "none");
  const ydr = level(caps.ydr, typeof m.writeYdr === "function" ? "xml-only" : "none");
  const ybn = level(caps.ybn, typeof m.writeYbn === "function" ? "xml-only" : "none");
  const yft = level(caps.yft, typeof m.readYft === "function" ? "read-only" : "none");
  return {
    rsc7: level(caps.rsc7, "native"),
    ytd,
    dds: level(caps.dds, typeof m.encodeDds === "function" ? "native" : "none"),
    ydr,
    ybn,
    ydd: level(caps.ydd, typeof m.readYdd === "function" ? "read-only" : "none"),
    yft,
    glb: level(caps.glb, typeof m.drawableToGlb === "function" ? "native" : "none"),
    xml: level(caps.xml, typeof m.ydrXml === "function" ? "native" : "none"),
    // A writer only counts as shippable when the package calls the format native.
    writeYtd: ytd === "native" && typeof m.writeYtd === "function",
    writeYdr: ydr === "native" && typeof m.writeYdr === "function",
    writeYbn: ybn === "native" && typeof m.writeYbn === "function",
    writeYft: yft === "native" && typeof m.writeYft === "function",
    writeYtyp: level(caps.ytyp) === "native" && typeof m.writeYtyp === "function",
  };
}

export function getRage(): RageModule {
  return current();
}

/** Async form kept for call sites that may run before the codec is resolved. */
export async function loadRage(): Promise<RageModule> {
  return current();
}

export function rageCapabilitiesSync(): RageCapabilities {
  return capabilitiesOf(current());
}

export async function rageCapabilities(): Promise<RageCapabilities> {
  return capabilitiesOf(current());
}

export async function requireRage(): Promise<RageModule> {
  return current();
}

/** For tests: swap in a stub codec. */
export function __setRage(m: RageModule | null) {
  override = m;
}

export function __resetRage() {
  override = null;
}

/* ────────────────────────── worker-side build inputs ────────────────────────── */

export interface BuildMesh {
  shaderIndex: number;
  positions: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  colors?: Float32Array;
  indices: Uint32Array;
  name?: string;
}

export interface BuildShader {
  name: string;
  textures: Record<string, string>;
  params?: Record<string, number[]>;
}

export interface BuildBounds {
  min: [number, number, number];
  max: [number, number, number];
  center?: [number, number, number];
  radius?: number;
}

export interface DrawableBuild {
  name: string;
  shaders: BuildShader[];
  lods: { high: BuildMesh[]; med?: BuildMesh[]; low?: BuildMesh[]; vlow?: BuildMesh[] };
  lodDistances?: [number, number, number, number];
  bounds?: BuildBounds;
}

export interface BoundBuild {
  type: "box" | "mesh";
  name?: string;
  bounds: BuildBounds;
  positions?: Float32Array;
  indices?: Uint32Array;
}

export interface YtypBuild {
  name: string;
  archetypes: {
    name: string;
    textureDictionary?: string;
    drawableDictionary?: string;
    physicsDictionary?: string;
    bounds: BuildBounds;
    flags?: number;
    lodDist?: number;
  }[];
}

const WRITABLE_SHADERS: WritableShaderName[] = ["default", "normal", "spec", "normal_spec"];

function shaderName(name: string): WritableShaderName {
  const lower = name.toLowerCase() as WritableShaderName;
  return WRITABLE_SHADERS.includes(lower) ? lower : "default";
}

export function fullBounds(b: BuildBounds): RageBounds {
  const center = b.center ?? ([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] as [number, number, number]);
  const radius = b.radius ?? Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2;
  return { min: [...b.min] as [number, number, number], max: [...b.max] as [number, number, number], center, radius };
}

const LOD_ORDER: LodLevel[] = ["high", "med", "low", "vlow"];

function meshInput(m: BuildMesh): DrawableMeshInput {
  return {
    positions: m.positions,
    normals: m.normals,
    uvs: m.uvs ? [m.uvs] : undefined,
    colors: m.colors ? Uint8Array.from(m.colors, (v) => Math.max(0, Math.min(255, Math.round(v * 255)))) : undefined,
    indices: m.indices,
    shaderIndex: m.shaderIndex,
  };
}

/** Map the worker's drawable description onto `writeYdr`'s input shape. */
export function toDrawableInput(build: DrawableBuild): RageDrawableInput {
  const distances = build.lodDistances ?? [50, 100, 200, 500];
  const lods: RageDrawableInput["lods"] = [];
  LOD_ORDER.forEach((level, i) => {
    const meshes = build.lods[level];
    if (!meshes?.length) return;
    lods.push({ meshes: meshes.map(meshInput), distance: distances[i] ?? 500 });
  });
  return {
    name: build.name,
    lods,
    shaders: build.shaders.map((s) => ({
      name: shaderName(s.name),
      textures: { DiffuseSampler: s.textures.DiffuseSampler ?? "", ...s.textures },
      params: s.params,
    })),
    bounds: build.bounds ? fullBounds(build.bounds) : undefined,
  };
}

function toRageMesh(m: BuildMesh): RageMesh {
  return {
    positions: m.positions,
    normals: m.normals,
    uvs: m.uvs ? [m.uvs] : [],
    colors: m.colors ? Uint8Array.from(m.colors, (v) => Math.max(0, Math.min(255, Math.round(v * 255)))) : undefined,
    indices: m.indices,
    shaderIndex: m.shaderIndex,
    vertexCount: m.positions.length / 3,
    vertexComponents: ["Position", ...(m.normals ? ["Normal"] : []), ...(m.uvs ? ["TexCoord0"] : [])],
  };
}

/** Map the worker's drawable description onto the reader shape the XML emitter consumes. */
export function toRageDrawable(build: DrawableBuild): RageDrawable {
  const empty: RageMesh[][] = [];
  const lods = {
    high: build.lods.high.length ? [build.lods.high.map(toRageMesh)] : empty,
    med: build.lods.med?.length ? [build.lods.med.map(toRageMesh)] : empty,
    low: build.lods.low?.length ? [build.lods.low.map(toRageMesh)] : empty,
    vlow: build.lods.vlow?.length ? [build.lods.vlow.map(toRageMesh)] : empty,
  } as Record<LodLevel, RageMesh[][]>;
  const allPositions = build.lods.high.flatMap((m) => Array.from(m.positions));
  const bounds = build.bounds ? fullBounds(build.bounds) : rage.boundsFromPositions(allPositions);
  return {
    name: build.name,
    lods,
    lodDistances: build.lodDistances ?? [50, 100, 200, 500],
    shaders: build.shaders.map((s) => ({
      name: shaderName(s.name),
      nameHash: rage.joaat(shaderName(s.name)),
      fileNameHash: rage.joaat(`${shaderName(s.name)}.sps`),
      renderBucket: 0,
      textures: s.textures,
      params: s.params ?? {},
    })) as RageShader[],
    bounds,
  };
}

/** Map a collision description onto `writeYbn`'s input shape. */
export function toBoundInput(build: BoundBuild): RageBoundInput {
  if (build.type === "box") {
    return { children: [{ type: "box", min: build.bounds.min, max: build.bounds.max }] };
  }
  if (!build.positions || !build.indices) throw new Error("mesh collision needs positions and indices");
  return { children: [{ type: "bvh", positions: build.positions, indices: build.indices }] };
}

/** Map an archetype description onto `ytypXml`'s input shape. */
export function toYtypInput(build: YtypBuild): RageYtypInput {
  return {
    name: build.name,
    archetypes: build.archetypes.map((a): YtypArchetype => {
      const b = fullBounds(a.bounds);
      return {
        name: a.name,
        txdName: a.textureDictionary ?? a.name,
        lodDist: a.lodDist ?? 500,
        bbMin: b.min,
        bbMax: b.max,
        bsCenter: b.center,
        bsRadius: b.radius,
        flags: a.flags ?? 32,
        assetType: a.drawableDictionary ? "ASSET_TYPE_DRAWABLE_DICTIONARY" : "ASSET_TYPE_DRAWABLE",
        assetName: a.name,
        physicsDictionary: a.physicsDictionary,
        drawableDictionary: a.drawableDictionary,
      };
    }),
  };
}

/** Wrap DDS buffers as RageTexture values so the XML emitter can describe them. */
export function ddsAsRageTextures(textures: { name: string; dds: Buffer }[]): RageTexture[] {
  const decode = current().decodeDds;
  return textures.map((t) => {
    const decoded = decode ? decode(t.dds) : null;
    return {
      name: t.name,
      nameHash: rage.joaat(t.name.toLowerCase()),
      width: decoded?.width ?? 0,
      height: decoded?.height ?? 0,
      depth: 1,
      stride: 0,
      format: (decoded?.format ?? "DXT5") as RageTexture["format"],
      mipLevels: decoded?.mips ?? 1,
      dataOffset: 0,
      dataSize: t.dds.length,
      vft: 0,
      levelData: (levelIndex: number) => (decoded ? decoded.levelData(levelIndex) : Buffer.alloc(0)),
      dds: () => t.dds,
      rgba: (levelIndex = 0) => {
        if (!decoded) return null;
        const data = decoded.rgba(levelIndex);
        if (!data) return null;
        const size = decoded.levelSize(levelIndex);
        return { width: size.width, height: size.height, data };
      },
    } satisfies RageTexture;
  });
}
