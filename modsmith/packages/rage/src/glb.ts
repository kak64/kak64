/**
 * glTF 2.0 binary (GLB) export, for browser previews via Three.js'
 * `GLTFLoader`.
 *
 * One glTF mesh is emitted per `DrawableModel` and one primitive per geometry,
 * carrying positions, normals, up to two UV sets, vertex colours and indices.
 * Materials are named after the RAGE shader and its diffuse texture, and
 * decoded textures are embedded as PNG in the binary chunk.
 *
 * Per-primitive `extras` carry `{ shaderIndex, shaderName, lod, modelName }`
 * and per-material `extras` carry `{ textures }`, so the editors can map glTF
 * primitives back to RAGE shaders without a second request.
 *
 * Verified: chunk layout, alignment and the JSON shape are unit-tested, and the
 * accessor/bufferView arithmetic is checked against the source geometry.
 *
 * @packageDocumentation
 */

import { RageFormatError } from "./errors.js";
import { encodePng } from "./png.js";
import { LOD_LEVELS, type LodLevel, type RageDrawable, type RageMesh } from "./types.js";
import type { RageTexture } from "./ytd.js";

/** `'glTF'` little-endian magic. */
export const GLB_MAGIC = 0x46546c67;
/** JSON chunk type. */
export const GLB_CHUNK_JSON = 0x4e4f534a;
/** Binary chunk type. */
export const GLB_CHUNK_BIN = 0x004e4942;

const COMPONENT_TYPE = {
  UNSIGNED_BYTE: 5121,
  UNSIGNED_SHORT: 5123,
  UNSIGNED_INT: 5125,
  FLOAT: 5126,
} as const;

/** Options for {@link drawableToGlb}. */
export interface GlbOptions {
  /** LOD slots to include. Defaults to the highest non-empty one. */
  lods?: LodLevel[];
  /** Embed decoded textures as PNG images (default true). */
  embedTextures?: boolean;
  /**
   * Rotate the scene so GTA's Z-up geometry appears Y-up, which is what glTF
   * viewers expect. Applied as a root node rotation; vertex data is untouched.
   * Default true.
   */
  zUpToYUp?: boolean;
}

interface BufferSlice {
  data: Buffer;
  /** glTF `target`, when the view backs vertex or index data. */
  target?: number;
}

/** Minimal glTF JSON document shape this module emits. */
interface GltfJson {
  asset: { version: string; generator: string };
  scene: number;
  scenes: Array<{ nodes: number[] }>;
  nodes: Array<Record<string, unknown>>;
  meshes: Array<Record<string, unknown>>;
  accessors: Array<Record<string, unknown>>;
  bufferViews: Array<Record<string, unknown>>;
  buffers: Array<{ byteLength: number }>;
  materials: Array<Record<string, unknown>>;
  images?: Array<Record<string, unknown>>;
  textures?: Array<Record<string, unknown>>;
  samplers?: Array<Record<string, unknown>>;
  extras?: Record<string, unknown>;
}

function pad4(n: number): number {
  return (4 - (n % 4)) % 4;
}

/**
 * Build a GLB from a drawable.
 *
 * @param drawable - Source drawable.
 * @param textures - Textures available for material lookup, matched to shader
 *   sampler values by name (case-insensitive).
 * @throws {@link RageFormatError} when the drawable has no geometry.
 */
export function drawableToGlb(
  drawable: RageDrawable,
  textures: RageTexture[] = [],
  options: GlbOptions = {},
): Buffer {
  const embedTextures = options.embedTextures !== false;
  const zUp = options.zUpToYUp !== false;

  let lods = options.lods;
  if (!lods) {
    const first = LOD_LEVELS.find((l) => drawable.lods[l].some((m) => m.length > 0));
    lods = first ? [first] : [];
  }
  const hasGeometry = lods.some((l) => drawable.lods[l].some((models) => models.length > 0));
  if (!hasGeometry) {
    throw new RageFormatError(`drawable "${drawable.name}" has no geometry to export`, {
      code: "EMPTY_DRAWABLE",
    });
  }

  const slices: BufferSlice[] = [];
  const json: GltfJson = {
    asset: { version: "2.0", generator: "@modsmith/rage" },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    accessors: [],
    bufferViews: [],
    buffers: [{ byteLength: 0 }],
    materials: [],
  };

  const addView = (data: Buffer, target?: number): number => {
    slices.push(target !== undefined ? { data, target } : { data });
    return slices.length - 1;
  };

  const addAccessor = (
    data: Buffer,
    componentType: number,
    type: string,
    count: number,
    options2: { normalized?: boolean; min?: number[]; max?: number[]; target?: number } = {},
  ): number => {
    const view = addView(data, options2.target);
    const accessor: Record<string, unknown> = {
      bufferView: view,
      componentType,
      count,
      type,
    };
    if (options2.normalized) accessor.normalized = true;
    if (options2.min) accessor.min = options2.min;
    if (options2.max) accessor.max = options2.max;
    json.accessors.push(accessor);
    return json.accessors.length - 1;
  };

  /* ------------------------------- materials ------------------------------- */
  const textureByName = new Map(textures.map((t) => [t.name.toLowerCase(), t]));
  const imageIndexByTexture = new Map<string, number>();

  const ensureImage = (name: string): number | null => {
    if (!embedTextures) return null;
    const key = name.toLowerCase();
    const existing = imageIndexByTexture.get(key);
    if (existing !== undefined) return existing;
    const tex = textureByName.get(key);
    if (!tex) return null;
    let png: Buffer;
    try {
      const decoded = tex.rgba(0);
      if (!decoded) return null;
      png = encodePng(decoded.data, decoded.width, decoded.height);
    } catch {
      return null;
    }
    const view = addView(png);
    json.images ??= [];
    json.textures ??= [];
    json.samplers ??= [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
    json.images.push({ bufferView: view, mimeType: "image/png", name: tex.name });
    json.textures.push({ sampler: 0, source: json.images.length - 1 });
    const index = json.textures.length - 1;
    imageIndexByTexture.set(key, index);
    return index;
  };

  drawable.shaders.forEach((shader, i) => {
    const diffuse = shader.textures.DiffuseSampler;
    const material: Record<string, unknown> = {
      name: diffuse ? `${shader.name}__${diffuse}` : `${shader.name}__${i}`,
      doubleSided: true,
      extras: { shaderIndex: i, shaderName: shader.name, textures: { ...shader.textures } },
    };
    const pbr: Record<string, unknown> = {
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0,
      roughnessFactor: 1,
    };
    if (diffuse) {
      const index = ensureImage(diffuse);
      if (index !== null) pbr.baseColorTexture = { index, texCoord: 0 };
    }
    const bump = shader.textures.BumpSampler;
    if (bump) {
      const index = ensureImage(bump);
      if (index !== null) material.normalTexture = { index, texCoord: 0 };
    }
    if (shader.renderBucket === 1 || shader.renderBucket === 3) {
      material.alphaMode = shader.renderBucket === 3 ? "MASK" : "BLEND";
    }
    material.pbrMetallicRoughness = pbr;
    json.materials.push(material);
  });
  if (json.materials.length === 0) {
    json.materials.push({
      name: "default",
      doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
      extras: { shaderIndex: 0, shaderName: "default", textures: {} },
    });
  }

  /* -------------------------------- geometry -------------------------------- */
  const meshNodes: number[] = [];

  const primitiveFor = (mesh: RageMesh, lod: LodLevel, modelName: string) => {
    const attributes: Record<string, number> = {};

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mesh.vertexCount; i++) {
      for (let c = 0; c < 3; c++) {
        const v = mesh.positions[i * 3 + c]!;
        if (v < min[c]!) min[c] = v;
        if (v > max[c]!) max[c] = v;
      }
    }
    attributes.POSITION = addAccessor(
      Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength),
      COMPONENT_TYPE.FLOAT,
      "VEC3",
      mesh.vertexCount,
      { min, max, target: 34962 },
    );

    if (mesh.normals) {
      attributes.NORMAL = addAccessor(
        Buffer.from(mesh.normals.buffer, mesh.normals.byteOffset, mesh.normals.byteLength),
        COMPONENT_TYPE.FLOAT,
        "VEC3",
        mesh.vertexCount,
        { target: 34962 },
      );
    }
    mesh.uvs.slice(0, 2).forEach((uv, i) => {
      attributes[`TEXCOORD_${i}`] = addAccessor(
        Buffer.from(uv.buffer, uv.byteOffset, uv.byteLength),
        COMPONENT_TYPE.FLOAT,
        "VEC2",
        mesh.vertexCount,
        { target: 34962 },
      );
    });
    if (mesh.colors) {
      attributes.COLOR_0 = addAccessor(
        Buffer.from(mesh.colors.buffer, mesh.colors.byteOffset, mesh.colors.byteLength),
        COMPONENT_TYPE.UNSIGNED_BYTE,
        "VEC4",
        mesh.vertexCount,
        { normalized: true, target: 34962 },
      );
    }

    const indexData = Buffer.alloc(mesh.indices.length * 4);
    for (let i = 0; i < mesh.indices.length; i++) indexData.writeUInt32LE(mesh.indices[i]!, i * 4);
    const indices = addAccessor(
      indexData,
      COMPONENT_TYPE.UNSIGNED_INT,
      "SCALAR",
      mesh.indices.length,
      { target: 34963 },
    );

    const material = Math.min(Math.max(0, mesh.shaderIndex), json.materials.length - 1);
    const shaderName = drawable.shaders[mesh.shaderIndex]?.name ?? "default";
    return {
      attributes,
      indices,
      material,
      mode: 4,
      extras: { shaderIndex: mesh.shaderIndex, shaderName, lod, modelName },
    };
  };

  for (const lod of lods) {
    drawable.lods[lod].forEach((model, modelIndex) => {
      if (model.length === 0) return;
      const modelName = `${drawable.name}_${lod}_${modelIndex}`;
      json.meshes.push({
        name: modelName,
        primitives: model.map((mesh) => primitiveFor(mesh, lod, modelName)),
      });
      json.nodes.push({ name: modelName, mesh: json.meshes.length - 1 });
      meshNodes.push(json.nodes.length - 1);
    });
  }

  if (zUp) {
    // −90° about X maps GTA's Z-up to glTF's Y-up.
    json.nodes.push({
      name: `${drawable.name}_root`,
      rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2],
      children: meshNodes,
    });
    json.scenes[0]!.nodes = [json.nodes.length - 1];
  } else {
    json.scenes[0]!.nodes = meshNodes;
  }

  json.extras = {
    drawableName: drawable.name,
    lodDistances: drawable.lodDistances,
    lods,
    shaders: drawable.shaders.map((s) => ({ name: s.name, textures: s.textures })),
  };

  /* ------------------------------ assemble GLB ------------------------------ */
  const binParts: Buffer[] = [];
  let offset = 0;
  slices.forEach((slice, i) => {
    const padding = pad4(offset);
    if (padding) {
      binParts.push(Buffer.alloc(padding));
      offset += padding;
    }
    const view: Record<string, unknown> = {
      buffer: 0,
      byteOffset: offset,
      byteLength: slice.data.length,
    };
    if (slice.target !== undefined) view.target = slice.target;
    json.bufferViews[i] = view;
    binParts.push(slice.data);
    offset += slice.data.length;
  });
  const binPadding = pad4(offset);
  if (binPadding) binParts.push(Buffer.alloc(binPadding));
  const bin = Buffer.concat(binParts);
  json.buffers[0]!.byteLength = bin.length;

  const jsonText = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadding = pad4(jsonText.length);
  const jsonChunk = Buffer.concat([jsonText, Buffer.alloc(jsonPadding, 0x20)]);

  const total = 12 + 8 + jsonChunk.length + (bin.length > 0 ? 8 + bin.length : 0);
  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(GLB_CHUNK_JSON, 16);
  jsonChunk.copy(out, 20);
  if (bin.length > 0) {
    const at = 20 + jsonChunk.length;
    out.writeUInt32LE(bin.length, at);
    out.writeUInt32LE(GLB_CHUNK_BIN, at + 4);
    bin.copy(out, at + 8);
  }
  return out;
}

/** A GLB parsed back into its two chunks — used by tests and by the worker. */
export interface ParsedGlb {
  version: number;
  json: Record<string, unknown>;
  bin: Buffer;
}

/**
 * Parse a GLB's header and chunks.
 *
 * @throws {@link RageFormatError} on bad magic, a bad version or a chunk layout
 *   that does not match the declared lengths.
 */
export function parseGlb(buf: Buffer | Uint8Array): ParsedGlb {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length < 20) {
    throw new RageFormatError(`GLB buffer is only ${b.length} bytes`, { code: "TRUNCATED" });
  }
  if (b.readUInt32LE(0) !== GLB_MAGIC) {
    throw new RageFormatError("not a GLB file (missing 'glTF' magic)", { code: "BAD_MAGIC" });
  }
  const version = b.readUInt32LE(4);
  const total = b.readUInt32LE(8);
  if (total !== b.length) {
    throw new RageFormatError(`GLB header declares ${total} bytes but the buffer is ${b.length}`, {
      code: "INCONSISTENT",
    });
  }
  let cursor = 12;
  let json: Record<string, unknown> | null = null;
  let bin: Buffer = Buffer.alloc(0);
  while (cursor + 8 <= b.length) {
    const length = b.readUInt32LE(cursor);
    const type = b.readUInt32LE(cursor + 4);
    const start = cursor + 8;
    if (start + length > b.length) {
      throw new RageFormatError(`GLB chunk at ${cursor} overruns the buffer`, {
        code: "TRUNCATED",
        offset: cursor,
      });
    }
    if (type === GLB_CHUNK_JSON) {
      json = JSON.parse(b.subarray(start, start + length).toString("utf8")) as Record<string, unknown>;
    } else if (type === GLB_CHUNK_BIN) {
      bin = Buffer.from(b.subarray(start, start + length));
    }
    cursor = start + length;
  }
  if (!json) throw new RageFormatError("GLB has no JSON chunk", { code: "BAD_GLB" });
  return { version, json, bin };
}
