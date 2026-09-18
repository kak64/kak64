/**
 * Native drawable writer: builds an RSC7 `.ydr` for a static (non-skinned)
 * drawable.
 *
 * > **Best-effort, unverified.** This writer emits the structure layout in
 * > {@link ./layout.js | layout.ts}, which is reconstructed from public format
 * > documentation rather than confirmed against retail files. Output round-trips
 * > through {@link ./drawable.js | readYdr}, which proves the structure is
 * > internally consistent — it does **not** prove the game will load it. The
 * > worker should treat `CAPABILITIES.ydr === "xml-only"` as the signal to use
 * > {@link ../xml.js | ydrXml} for real exports.
 *
 * @packageDocumentation
 */

import { ResourceBuilder, type Block } from "./binary.js";
import { RageFormatError, RageUnsupportedError } from "./errors.js";
import { joaat } from "./hash.js";
import {
  DRAWABLE,
  DRAWABLE_GEOMETRY,
  DRAWABLE_MODEL,
  INDEX_BUFFER,
  SHADER_FX,
  SHADER_GROUP,
  VERTEX_BUFFER,
  VERTEX_COMPONENTS,
  VERTEX_DECLARATION,
  VERTEX_ELEMENT_TYPES,
  VT_COLOUR,
  VT_FLOAT2,
  VT_FLOAT3,
  VT_FLOAT4,
} from "./layout.js";
import { RESOURCE_VERSIONS, writeRsc7 } from "./rsc7.js";
import { boundsFromPositions, mergeBounds, type RageBounds } from "./types.js";

/** Shader names the native writer can emit. */
export type WritableShaderName = "default" | "normal" | "spec" | "normal_spec";

/** One mesh handed to {@link writeYdr}. */
export interface DrawableMeshInput {
  /** Flat `xyz` positions. */
  positions: ArrayLike<number>;
  /** Flat `xyz` normals; generated flat-shaded when omitted. */
  normals?: ArrayLike<number>;
  /** Up to two UV sets, each flat `uv`. */
  uvs?: ArrayLike<number>[];
  /** Flat RGBA bytes; defaults to opaque white. */
  colors?: ArrayLike<number>;
  /** Flat `xyzw` tangents. */
  tangents?: ArrayLike<number>;
  /** Triangle-list indices. */
  indices: ArrayLike<number>;
  /** Index into {@link DrawableInput.shaders}. */
  shaderIndex: number;
}

/** One LOD handed to {@link writeYdr}. */
export interface DrawableLodInput {
  meshes: DrawableMeshInput[];
  /** LOD switch distance. */
  distance: number;
}

/** One shader handed to {@link writeYdr}. */
export interface DrawableShaderInput {
  name: WritableShaderName;
  textures: {
    DiffuseSampler: string;
    BumpSampler?: string;
    SpecSampler?: string;
    [other: string]: string | undefined;
  };
  /** Extra numeric parameters, each a flat list of 4·n floats. */
  params?: Record<string, number[]>;
  /** Render bucket; defaults to 0 (opaque). */
  renderBucket?: number;
}

/** Input to {@link writeYdr}. */
export interface DrawableInput {
  name: string;
  /** Up to four LODs, high → very low. */
  lods: DrawableLodInput[];
  shaders: DrawableShaderInput[];
  /** Overall bounds; computed from the high LOD when omitted. */
  bounds?: RageBounds;
}

/** Render bucket a shader name defaults to. */
const DEFAULT_BUCKETS: Record<WritableShaderName, number> = {
  default: 0,
  normal: 0,
  spec: 0,
  normal_spec: 0,
};

/** Texture parameters each writable shader declares, in parameter order. */
const SHADER_TEXTURE_PARAMS: Record<WritableShaderName, string[]> = {
  default: ["DiffuseSampler"],
  normal: ["DiffuseSampler", "BumpSampler"],
  spec: ["DiffuseSampler", "SpecSampler"],
  normal_spec: ["DiffuseSampler", "BumpSampler", "SpecSampler"],
};

interface VertexLayoutComponent {
  slot: number;
  typeCode: number;
  size: number;
  offset: number;
}

/**
 * Choose the vertex format for a mesh: always `Position` + `Normal` +
 * `Colour0`, plus `TexCoord0`/`TexCoord1` and `Tangent` when the mesh supplies
 * them. Components are laid out in slot order, which is what the declaration's
 * flag word implies.
 */
function planVertexLayout(mesh: DrawableMeshInput): {
  components: VertexLayoutComponent[];
  stride: number;
  flags: number;
  types: bigint;
} {
  const wanted: Array<{ name: string; typeCode: number }> = [
    { name: "Position", typeCode: VT_FLOAT3 },
    { name: "Normal", typeCode: VT_FLOAT3 },
    { name: "Colour0", typeCode: VT_COLOUR },
  ];
  const uvCount = Math.min(2, mesh.uvs?.length ?? 1);
  for (let i = 0; i < Math.max(1, uvCount); i++) {
    wanted.push({ name: `TexCoord${i}`, typeCode: VT_FLOAT2 });
  }
  if (mesh.tangents) wanted.push({ name: "Tangent", typeCode: VT_FLOAT4 });

  const components: VertexLayoutComponent[] = wanted
    .map((w) => {
      const slot = VERTEX_COMPONENTS.indexOf(w.name as (typeof VERTEX_COMPONENTS)[number]);
      if (slot < 0) {
        throw new RageFormatError(`unknown vertex component "${w.name}"`, { code: "BAD_INPUT" });
      }
      return { slot, typeCode: w.typeCode, size: VERTEX_ELEMENT_TYPES[w.typeCode]!.size, offset: 0 };
    })
    .sort((a, b) => a.slot - b.slot);

  let stride = 0;
  let flags = 0;
  let types = 0n;
  for (const c of components) {
    c.offset = stride;
    stride += c.size;
    flags |= 1 << c.slot;
    types |= BigInt(c.typeCode) << BigInt(c.slot * 4);
  }
  return { components, stride, flags, types };
}

/** Generate flat-shaded normals when a mesh supplies none. */
function generateNormals(positions: ArrayLike<number>, indices: ArrayLike<number>): Float32Array {
  const n = new Float32Array(positions.length);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [i0, i1, i2] = [indices[t] as number, indices[t + 1] as number, indices[t + 2] as number];
    const ax = (positions[i1 * 3] as number) - (positions[i0 * 3] as number);
    const ay = (positions[i1 * 3 + 1] as number) - (positions[i0 * 3 + 1] as number);
    const az = (positions[i1 * 3 + 2] as number) - (positions[i0 * 3 + 2] as number);
    const bx = (positions[i2 * 3] as number) - (positions[i0 * 3] as number);
    const by = (positions[i2 * 3 + 1] as number) - (positions[i0 * 3 + 1] as number);
    const bz = (positions[i2 * 3 + 2] as number) - (positions[i0 * 3 + 2] as number);
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (const i of [i0, i1, i2]) {
      n[i * 3] = n[i * 3]! + nx;
      n[i * 3 + 1] = n[i * 3 + 1]! + ny;
      n[i * 3 + 2] = n[i * 3 + 2]! + nz;
    }
  }
  for (let i = 0; i + 2 < n.length; i += 3) {
    const len = Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) || 1;
    n[i] = n[i]! / len;
    n[i + 1] = n[i + 1]! / len;
    n[i + 2] = n[i + 2]! / len;
  }
  return n;
}

/**
 * Build a native RSC7 `.ydr` for a static drawable.
 *
 * @throws {@link RageFormatError} for malformed meshes or out-of-range shader
 *   indices, and {@link RageUnsupportedError} for inputs beyond the writer's
 *   subset (more than 4 LODs, more than 65535 vertices in one geometry).
 */
export function writeYdr(input: DrawableInput): Buffer {
  const builder = new ResourceBuilder();
  buildDrawable(builder, input);
  const built = builder.build();
  return writeRsc7({
    version: RESOURCE_VERSIONS.ydr,
    system: built.system,
    graphics: built.graphics,
    systemMinBaseSize: built.largestSystemBlock,
    graphicsMinBaseSize: built.largestGraphicsBlock,
  });
}

/**
 * Lay a `gtaDrawable` and everything it owns into `builder`, returning the
 * drawable block.
 *
 * Exported so drawable dictionaries and fragments can embed drawables; call it
 * first on a fresh builder when the drawable must be the resource root.
 *
 * @throws {@link RageFormatError} for malformed meshes or out-of-range shader
 *   indices, and {@link RageUnsupportedError} for inputs beyond the writer's
 *   subset (more than 4 LODs, more than 65535 vertices in one geometry).
 */
export function buildDrawable(builder: ResourceBuilder, input: DrawableInput): Block {
  if (input.lods.length === 0) {
    throw new RageFormatError("writeYdr needs at least one LOD", { code: "BAD_INPUT" });
  }
  if (input.lods.length > 4) {
    throw new RageUnsupportedError(
      `a drawable has at most 4 LODs, got ${input.lods.length}`,
      { code: "TOO_MANY_LODS" },
    );
  }
  if (input.shaders.length === 0) {
    throw new RageFormatError("writeYdr needs at least one shader", { code: "BAD_INPUT" });
  }

  const drawable = builder.system({ size: DRAWABLE.SIZE, align: 16, label: "gtaDrawable" });

  /* ------------------------------ shader group ------------------------------ */
  const shaderGroup = builder.system({ size: SHADER_GROUP.SIZE, align: 16, label: "ShaderGroup" });
  const shaderPointers = builder.system({ align: 16, label: "shaderPointers" });

  const shaderBlocks = input.shaders.map((shader, index) => {
    const block = builder.system({ size: SHADER_FX.SIZE, align: 16, label: `ShaderFX:${index}` });
    const textureParams = SHADER_TEXTURE_PARAMS[shader.name];
    if (!textureParams) {
      throw new RageUnsupportedError(
        `the native writer supports shaders ${Object.keys(SHADER_TEXTURE_PARAMS).join(", ")}, not "${shader.name}"`,
        { code: "UNSUPPORTED_SHADER" },
      );
    }

    const paramNames: string[] = [];
    const paramTypes: number[] = [];
    const paramValues: Array<Block | number[]> = [];

    for (const param of textureParams) {
      const texName = shader.textures[param];
      if (param === "DiffuseSampler" && !texName) {
        throw new RageFormatError(`shader ${index} ("${shader.name}") has no DiffuseSampler`, {
          code: "BAD_INPUT",
        });
      }
      if (!texName) continue;
      // Texture reference: a TextureBase carrying only a name.
      const texBlock = builder.system({ size: 0x30, align: 16, label: `TextureRef:${texName}` });
      texBlock.seek(0x00).u32(0).u32(1);
      texBlock.seek(0x18).u32(1).u32(0);
      texBlock.seek(0x20).pointer(builder.string(texName)).u32(0).u32(0).u32(0);
      paramNames.push(param);
      paramTypes.push(0);
      paramValues.push(texBlock);
    }

    for (const [name, values] of Object.entries(shader.params ?? {})) {
      if (values.length === 0 || values.length % 4 !== 0) {
        throw new RageFormatError(
          `shader parameter "${name}" must be a multiple of 4 floats, got ${values.length}`,
          { code: "BAD_INPUT" },
        );
      }
      paramNames.push(name);
      paramTypes.push(values.length / 4);
      paramValues.push(values);
    }

    const valueArray = builder.system({ align: 16, label: `shaderParams:${index}` });
    const hashArray = builder.system({ align: 16, label: `shaderParamHashes:${index}` });
    const typeArray = builder.system({ align: 16, label: `shaderParamTypes:${index}` });
    const sizeArray = builder.system({ align: 16, label: `shaderParamSizes:${index}` });

    for (const value of paramValues) {
      if (Array.isArray(value)) {
        const vectorBlock = builder.system({ align: 16, label: "shaderParamVector" });
        for (const v of value) vectorBlock.f32(v);
        valueArray.pointer(vectorBlock).u32(0).u64(0n);
      } else {
        valueArray.pointer(value).u32(0).u64(0n);
      }
    }
    for (const name of paramNames) hashArray.u32(joaat(name));
    for (const t of paramTypes) typeArray.u8(t);
    for (const t of paramTypes) sizeArray.u8(t === 0 ? 0 : t * 16);

    block.seek(SHADER_FX.PARAMS_PTR).pointer(valueArray).u32(0);
    block.seek(SHADER_FX.PARAM_HASHES_PTR).pointer(hashArray).u32(0);
    block.seek(SHADER_FX.PARAM_SIZES_PTR).pointer(sizeArray).u32(0);
    block.seek(SHADER_FX.PARAM_TYPES_PTR).pointer(typeArray).u32(0);
    block.seek(SHADER_FX.PARAM_COUNT).u8(paramNames.length).u8(0);
    block.seek(SHADER_FX.RENDER_BUCKET).u8(shader.renderBucket ?? DEFAULT_BUCKETS[shader.name]);
    block.seek(SHADER_FX.NAME_HASH).u32(joaat(shader.name)).u32(joaat(shader.name));
    return block;
  });

  for (const b of shaderBlocks) shaderPointers.pointer(b).u32(0);
  shaderGroup.seek(SHADER_GROUP.VFT).u32(0).u32(1);
  shaderGroup.seek(SHADER_GROUP.TEXTURE_DICTIONARY_PTR).u64(0n); // no embedded dictionary
  shaderGroup.seek(SHADER_GROUP.SHADERS_PTR).pointer(shaderPointers).u32(0);
  shaderGroup
    .seek(SHADER_GROUP.SHADERS_COUNT)
    .u16(shaderBlocks.length)
    .u16(shaderBlocks.length);

  /* --------------------------------- models --------------------------------- */
  const lodArrayBlocks: Array<Block | null> = [null, null, null, null];
  let overall: RageBounds | null = input.bounds ?? null;

  input.lods.forEach((lod, lodIndex) => {
    if (lod.meshes.length === 0) return;

    const geometryBlocks: Block[] = [];
    const geometryBounds: RageBounds[] = [];

    for (const mesh of lod.meshes) {
      if (mesh.shaderIndex < 0 || mesh.shaderIndex >= input.shaders.length) {
        throw new RageFormatError(
          `mesh shaderIndex ${mesh.shaderIndex} is out of range (0…${input.shaders.length - 1})`,
          { code: "BAD_INPUT" },
        );
      }
      if (mesh.positions.length % 3 !== 0) {
        throw new RageFormatError(
          `mesh positions length ${mesh.positions.length} is not a multiple of 3`,
          { code: "BAD_INPUT" },
        );
      }
      const vertexCount = mesh.positions.length / 3;
      if (vertexCount === 0) {
        throw new RageFormatError("mesh has no vertices", { code: "BAD_INPUT" });
      }
      if (vertexCount > 0xffff) {
        throw new RageUnsupportedError(
          `geometry has ${vertexCount} vertices; 16-bit index buffers cap a geometry at 65535`,
          { code: "TOO_MANY_VERTICES" },
        );
      }
      if (mesh.indices.length % 3 !== 0) {
        throw new RageFormatError(
          `mesh index count ${mesh.indices.length} is not a multiple of 3`,
          { code: "BAD_INPUT" },
        );
      }
      for (let i = 0; i < mesh.indices.length; i++) {
        const v = mesh.indices[i] as number;
        if (v < 0 || v >= vertexCount) {
          throw new RageFormatError(
            `mesh index ${v} at position ${i} is out of range for ${vertexCount} vertices`,
            { code: "BAD_INPUT" },
          );
        }
      }

      const layout = planVertexLayout(mesh);
      const normals = mesh.normals ?? generateNormals(mesh.positions, mesh.indices);

      const vertexData = builder.graphics({ align: 16, label: "vertexData" });
      const scratch = Buffer.alloc(layout.stride);
      for (let v = 0; v < vertexCount; v++) {
        scratch.fill(0);
        for (const c of layout.components) {
          const o = c.offset;
          switch (VERTEX_COMPONENTS[c.slot]) {
            case "Position":
              scratch.writeFloatLE(mesh.positions[v * 3] as number, o);
              scratch.writeFloatLE(mesh.positions[v * 3 + 1] as number, o + 4);
              scratch.writeFloatLE(mesh.positions[v * 3 + 2] as number, o + 8);
              break;
            case "Normal":
              scratch.writeFloatLE((normals[v * 3] as number) || 0, o);
              scratch.writeFloatLE((normals[v * 3 + 1] as number) || 0, o + 4);
              scratch.writeFloatLE((normals[v * 3 + 2] as number) || 0, o + 8);
              break;
            case "Colour0": {
              const c0 = mesh.colors;
              scratch[o] = c0 ? ((c0[v * 4] as number) & 0xff) : 255;
              scratch[o + 1] = c0 ? ((c0[v * 4 + 1] as number) & 0xff) : 255;
              scratch[o + 2] = c0 ? ((c0[v * 4 + 2] as number) & 0xff) : 255;
              scratch[o + 3] = c0 ? ((c0[v * 4 + 3] as number) & 0xff) : 255;
              break;
            }
            case "Tangent":
              scratch.writeFloatLE((mesh.tangents?.[v * 4] as number) ?? 0, o);
              scratch.writeFloatLE((mesh.tangents?.[v * 4 + 1] as number) ?? 0, o + 4);
              scratch.writeFloatLE((mesh.tangents?.[v * 4 + 2] as number) ?? 0, o + 8);
              scratch.writeFloatLE((mesh.tangents?.[v * 4 + 3] as number) ?? 1, o + 12);
              break;
            default: {
              const uvIndex = Number(VERTEX_COMPONENTS[c.slot]!.slice("TexCoord".length));
              const set = mesh.uvs?.[uvIndex];
              scratch.writeFloatLE((set?.[v * 2] as number) ?? 0, o);
              scratch.writeFloatLE((set?.[v * 2 + 1] as number) ?? 0, o + 4);
              break;
            }
          }
        }
        vertexData.bytes(scratch);
      }

      const declaration = builder.system({ size: VERTEX_DECLARATION.SIZE, align: 16, label: "VertexDecl" });
      declaration.seek(VERTEX_DECLARATION.TYPES).u64(layout.types);
      declaration.seek(VERTEX_DECLARATION.FLAGS).u32(layout.flags);
      declaration
        .seek(VERTEX_DECLARATION.STRIDE)
        .u16(layout.stride)
        .u8(0x0d)
        .u8(layout.components.length);

      const vertexBuffer = builder.system({ size: VERTEX_BUFFER.SIZE, align: 16, label: "VertexBuffer" });
      vertexBuffer.seek(VERTEX_BUFFER.VFT).u32(0).u32(1);
      vertexBuffer.seek(VERTEX_BUFFER.VERTEX_STRIDE).u16(layout.stride).u16(0).u32(0);
      vertexBuffer.seek(VERTEX_BUFFER.VERTEX_COUNT).u32(vertexCount).u32(0);
      vertexBuffer.seek(VERTEX_BUFFER.DATA_PTR).pointer(vertexData).u32(0);
      vertexBuffer.seek(VERTEX_BUFFER.VERTEX_DECLARATION_PTR).pointer(declaration).u32(0);
      vertexBuffer.seek(VERTEX_BUFFER.DATA_PTR2).pointer(vertexData).u32(0);

      const indexData = builder.graphics({ align: 16, label: "indexData" });
      for (let i = 0; i < mesh.indices.length; i++) indexData.u16(mesh.indices[i] as number);

      const indexBuffer = builder.system({ size: INDEX_BUFFER.SIZE, align: 16, label: "IndexBuffer" });
      indexBuffer.seek(INDEX_BUFFER.VFT).u32(0).u32(1);
      indexBuffer.seek(INDEX_BUFFER.INDICES_COUNT).u32(mesh.indices.length).u32(0);
      indexBuffer.seek(INDEX_BUFFER.DATA_PTR).pointer(indexData).u32(0);

      const geometry = builder.system({ size: DRAWABLE_GEOMETRY.SIZE, align: 16, label: "Geometry" });
      geometry.seek(DRAWABLE_GEOMETRY.VFT).u32(0).u32(1);
      geometry.seek(DRAWABLE_GEOMETRY.VERTEX_BUFFER_PTR).pointer(vertexBuffer).u32(0);
      geometry.seek(DRAWABLE_GEOMETRY.INDEX_BUFFER_PTR).pointer(indexBuffer).u32(0);
      geometry
        .seek(DRAWABLE_GEOMETRY.INDICES_COUNT)
        .u32(mesh.indices.length)
        .u32(mesh.indices.length / 3);
      geometry.seek(DRAWABLE_GEOMETRY.VERTEX_COUNT).u16(vertexCount).u16(layout.stride);

      geometryBlocks.push(geometry);
      geometryBounds.push(boundsFromPositions(mesh.positions));
    }

    const geometryPointers = builder.system({ align: 16, label: "geometryPointers" });
    for (const g of geometryBlocks) geometryPointers.pointer(g).u32(0);

    const shaderMapping = builder.system({ align: 16, label: "shaderMapping" });
    for (const mesh of lod.meshes) shaderMapping.u16(mesh.shaderIndex);

    // One combined AABB, then one per geometry when there is more than one.
    const combined = geometryBounds.reduce((a, b) => mergeBounds(a, b));
    const boundsBlock = builder.system({ align: 16, label: "modelBounds" });
    const writeAabb = (b: RageBounds) => {
      boundsBlock.f32(b.min[0]).f32(b.min[1]).f32(b.min[2]).f32(0);
      boundsBlock.f32(b.max[0]).f32(b.max[1]).f32(b.max[2]).f32(0);
    };
    writeAabb(combined);
    if (geometryBounds.length > 1) for (const b of geometryBounds) writeAabb(b);

    const model = builder.system({ size: DRAWABLE_MODEL.SIZE, align: 16, label: "DrawableModel" });
    model.seek(DRAWABLE_MODEL.VFT).u32(0).u32(1);
    model.seek(DRAWABLE_MODEL.GEOMETRIES_PTR).pointer(geometryPointers).u32(0);
    model
      .seek(DRAWABLE_MODEL.GEOMETRIES_COUNT)
      .u16(geometryBlocks.length)
      .u16(geometryBlocks.length)
      .u32(0);
    model.seek(DRAWABLE_MODEL.BOUNDS_PTR).pointer(boundsBlock).u32(0);
    model.seek(DRAWABLE_MODEL.SHADER_MAPPING_PTR).pointer(shaderMapping).u32(0);
    model.seek(DRAWABLE_MODEL.FLAGS).u32(0).u32(0); // static: no skin, no bones

    const modelPointers = builder.system({ align: 16, label: `modelPointers:${lodIndex}` });
    modelPointers.pointer(model).u32(0);

    const lodArray = builder.system({ size: 0x10, align: 16, label: `lodArray:${lodIndex}` });
    lodArray.seek(0).pointer(modelPointers).u32(0).u16(1).u16(1).u32(0);
    lodArrayBlocks[lodIndex] = lodArray;

    if (lodIndex === 0) overall = overall ?? combined;
    else if (!input.bounds) overall = overall ? mergeBounds(overall, combined) : combined;
  });

  const bounds: RageBounds = overall ?? {
    min: [0, 0, 0],
    max: [0, 0, 0],
    center: [0, 0, 0],
    radius: 0,
  };

  /* -------------------------------- drawable -------------------------------- */
  drawable.seek(DRAWABLE.VFT).u32(0).u32(1).u64(0n);
  drawable.seek(DRAWABLE.SHADER_GROUP_PTR).pointer(shaderGroup).u32(0);
  drawable.seek(DRAWABLE.SKELETON_PTR).u64(0n);
  drawable
    .seek(DRAWABLE.BOUNDING_CENTER)
    .f32(bounds.center[0])
    .f32(bounds.center[1])
    .f32(bounds.center[2])
    .f32(bounds.radius);
  drawable.seek(DRAWABLE.BOUNDING_BOX_MIN).f32(bounds.min[0]).f32(bounds.min[1]).f32(bounds.min[2]).f32(0);
  drawable.seek(DRAWABLE.BOUNDING_BOX_MAX).f32(bounds.max[0]).f32(bounds.max[1]).f32(bounds.max[2]).f32(0);

  for (let i = 0; i < 4; i++) {
    drawable.seek(DRAWABLE.MODELS_PTR[i]!).pointer(lodArrayBlocks[i]).u32(0);
    drawable.seek(DRAWABLE.LOD_DIST[i]!).f32(input.lods[i]?.distance ?? 9999);
    // Render bucket mask: bit 0 (visible) plus the shadow/reflection buckets
    // the game sets for ordinary opaque geometry.
    drawable.seek(DRAWABLE.RENDER_MASK[i]!).u32(lodArrayBlocks[i] ? 0xff : 0);
  }
  drawable.seek(DRAWABLE.NAME_PTR).pointer(builder.string(input.name)).u32(0);

  return drawable;
}

/** One entry of a {@link writeYdd} drawable dictionary. */
export interface DrawableDictionaryEntry {
  /** Dictionary key; hashed with joaat. Defaults to the drawable's name. */
  name?: string;
  drawable: DrawableInput;
}

/**
 * Build a native RSC7 `.ydd` drawable dictionary.
 *
 * Like a texture dictionary, entries are sorted by ascending `joaat(name)` so
 * the game's binary search finds them.
 *
 * Carries the same unverified-layout caveat as {@link writeYdr}.
 *
 * @throws {@link RageFormatError} on duplicate name hashes.
 */
export function writeYdd(entries: DrawableDictionaryEntry[]): Buffer {
  const sorted = entries
    .map((e) => {
      const name = e.name ?? e.drawable.name;
      return { name, hash: joaat(name), drawable: e.drawable };
    })
    .sort((a, b) => a.hash - b.hash);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.hash === sorted[i - 1]!.hash) {
      throw new RageFormatError(
        `drawables "${sorted[i - 1]!.name}" and "${sorted[i]!.name}" collide on name hash`,
        { code: "DUPLICATE_KEY" },
      );
    }
  }

  const builder = new ResourceBuilder();
  const dict = builder.system({ size: 0x40, align: 16, label: "DrawableDictionary" });
  const hashes = sorted.length > 0 ? builder.system({ align: 16, label: "nameHashes" }) : null;
  const pointers = sorted.length > 0 ? builder.system({ align: 16, label: "drawablePointers" }) : null;

  const blocks = sorted.map((e) => buildDrawable(builder, { ...e.drawable, name: e.name }));
  if (hashes) for (const e of sorted) hashes.u32(e.hash);
  if (pointers) for (const b of blocks) pointers.pointer(b).u32(0);

  dict
    .seek(0x00)
    .u32(0)
    .u32(1)
    .u64(0n)
    .u32(0)
    .u32(0)
    .u32(0)
    .u32(0)
    .pointer(hashes)
    .u32(0)
    .u16(sorted.length)
    .u16(sorted.length)
    .u32(0)
    .pointer(pointers)
    .u32(0)
    .u16(sorted.length)
    .u16(sorted.length)
    .u32(0);

  const built = builder.build();
  return writeRsc7({
    version: RESOURCE_VERSIONS.ydd,
    system: built.system,
    graphics: built.graphics,
    systemMinBaseSize: built.largestSystemBlock,
    graphicsMinBaseSize: built.largestGraphicsBlock,
  });
}
