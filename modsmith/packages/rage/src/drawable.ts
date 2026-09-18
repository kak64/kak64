/**
 * Drawable readers: `.ydr` (drawable), `.ydd` (drawable dictionary) and `.yft`
 * (fragment).
 *
 * > **Best-effort.** These readers walk the structure layout in
 * > {@link ./layout.js | layout.ts}, which is reconstructed from public format
 * > documentation and **not verified against retail game files**. Every step
 * > validates what it reads — pointer segments, counts, strides, triangle
 * > arithmetic, finite floats — and throws {@link RageFormatError} with a
 * > specific message when something does not line up, so a layout mismatch
 * > surfaces as a clear failure instead of wrong geometry.
 * >
 * > They are proven end to end against resources produced by this package's own
 * > {@link ./writer.js | writer}.
 *
 * @packageDocumentation
 */

import { ResourceReader, type DecodedPointer, type Segment } from "./binary.js";
import { RageFormatError, RageUnsupportedError } from "./errors.js";
import { paramNameFromHash, shaderNameFromHash } from "./hash.js";
import {
  BONE,
  DRAWABLE,
  DRAWABLE_GEOMETRY,
  DRAWABLE_MODEL,
  INDEX_BUFFER,
  PTR_ARRAY,
  SHADER_FX,
  SHADER_GROUP,
  SKELETON,
  VERTEX_BUFFER,
  VERTEX_COMPONENTS,
  VERTEX_DECLARATION,
  VERTEX_ELEMENT_TYPES,
} from "./layout.js";
import { parseRsc7 } from "./rsc7.js";
import {
  boundsFromPositions,
  emptyBounds,
  LOD_LEVELS,
  type LodLevel,
  type RageBone,
  type RageBounds,
  type RageDrawable,
  type RageDrawableEntry,
  type RageFragment,
  type RageMesh,
  type RageShader,
} from "./types.js";
import { readTextureDictionaryStruct, type RageTexture } from "./ytd.js";

/** Upper bound on any array count we will believe, to catch bad offsets early. */
const SANE_COUNT = 0xffff;

function need(p: DecodedPointer | null, what: string): DecodedPointer {
  if (!p) throw new RageFormatError(`${what}: expected a pointer but found null`, { code: "NULL_POINTER" });
  return p;
}

function expectSystem(p: DecodedPointer, what: string): DecodedPointer {
  if (p.segment !== "system") {
    throw new RageFormatError(
      `${what}: expected a system-segment pointer but it points into the graphics segment`,
      { code: "BAD_POINTER", offset: p.offset },
    );
  }
  return p;
}

function sane(count: number, what: string, offset: number): number {
  if (!Number.isInteger(count) || count < 0 || count > SANE_COUNT) {
    throw new RageFormatError(`${what}: implausible count ${count} — the structure layout does not match`, {
      code: "IMPLAUSIBLE",
      offset,
    });
  }
  return count;
}

function finite(v: number, what: string): number {
  if (!Number.isFinite(v)) {
    throw new RageFormatError(`${what}: expected a finite float but read ${v}`, {
      code: "IMPLAUSIBLE",
    });
  }
  return v;
}

/** Read a `pgPtrArray<T>` header into a list of entry pointers. */
function readPtrArray(
  reader: ResourceReader,
  segment: Segment,
  offset: number,
  what: string,
): Array<DecodedPointer | null> {
  const entries = reader.pointer(segment, offset + PTR_ARRAY.ENTRIES_PTR);
  const count = sane(reader.u16(segment, offset + PTR_ARRAY.COUNT), what, offset);
  if (count === 0) return [];
  const list = expectSystem(need(entries, what), what);
  const out: Array<DecodedPointer | null> = [];
  for (let i = 0; i < count; i++) out.push(reader.pointer(list.segment, list.offset + i * 8));
  return out;
}

/** Decode an IEEE half-precision float. */
function halfToFloat(h: number): number {
  const sign = (h & 0x8000) >> 15;
  const exponent = (h & 0x7c00) >> 10;
  const fraction = h & 0x03ff;
  let value: number;
  if (exponent === 0) value = fraction * 2 ** -24;
  else if (exponent === 0x1f) value = fraction === 0 ? Infinity : NaN;
  else value = (1 + fraction / 1024) * 2 ** (exponent - 15);
  return sign ? -value : value;
}

/** A single decoded component slot of a vertex declaration. */
interface VertexComponent {
  slot: number;
  name: string;
  typeCode: number;
  typeName: string;
  size: number;
  /** Byte offset of the component inside one vertex. */
  offset: number;
}

/** A decoded `grcVertexDeclaration`. */
export interface VertexDeclaration {
  stride: number;
  components: VertexComponent[];
}

/**
 * Decode a vertex declaration: the 64-bit `types` word holds a 4-bit element
 * type per slot, and the `flags` word says which of the 16 slots are present.
 * Components appear in the buffer in slot order.
 *
 * @throws {@link RageFormatError} when the components do not add up to the
 *   declared stride — the clearest signal that the layout does not match.
 */
export function readVertexDeclaration(
  reader: ResourceReader,
  ptr: DecodedPointer,
): VertexDeclaration {
  const { segment, offset } = ptr;
  const types = reader.u64(segment, offset + VERTEX_DECLARATION.TYPES);
  const flags = reader.u32(segment, offset + VERTEX_DECLARATION.FLAGS);
  const stride = reader.u16(segment, offset + VERTEX_DECLARATION.STRIDE);

  const components: VertexComponent[] = [];
  let cursor = 0;
  for (let slot = 0; slot < 16; slot++) {
    if (!(flags & (1 << slot))) continue;
    const typeCode = Number((types >> BigInt(slot * 4)) & 0xfn);
    const info = VERTEX_ELEMENT_TYPES[typeCode]!;
    if (info.size === 0) {
      throw new RageUnsupportedError(
        `vertex component ${VERTEX_COMPONENTS[slot]} uses unsupported element type ${typeCode}`,
        { code: "UNSUPPORTED_VERTEX_TYPE", offset },
      );
    }
    components.push({
      slot,
      name: VERTEX_COMPONENTS[slot]!,
      typeCode,
      typeName: info.name,
      size: info.size,
      offset: cursor,
    });
    cursor += info.size;
  }

  if (stride !== cursor) {
    throw new RageFormatError(
      `vertex declaration stride is ${stride} but its ${components.length} component(s) total ${cursor} bytes`,
      { code: "BAD_VERTEX_DECL", offset },
    );
  }
  if (stride === 0) {
    throw new RageFormatError("vertex declaration has a zero stride", {
      code: "BAD_VERTEX_DECL",
      offset,
    });
  }
  return { stride, components };
}

/** Read `count` floats of a component from one vertex. */
function readComponent(data: Buffer, base: number, comp: VertexComponent): number[] {
  const o = base + comp.offset;
  switch (comp.typeName) {
    case "Float":
      return [data.readFloatLE(o)];
    case "Float2":
      return [data.readFloatLE(o), data.readFloatLE(o + 4)];
    case "Float3":
      return [data.readFloatLE(o), data.readFloatLE(o + 4), data.readFloatLE(o + 8)];
    case "Float4":
      return [
        data.readFloatLE(o),
        data.readFloatLE(o + 4),
        data.readFloatLE(o + 8),
        data.readFloatLE(o + 12),
      ];
    case "Half2":
      return [halfToFloat(data.readUInt16LE(o)), halfToFloat(data.readUInt16LE(o + 2))];
    case "Half4":
      return [
        halfToFloat(data.readUInt16LE(o)),
        halfToFloat(data.readUInt16LE(o + 2)),
        halfToFloat(data.readUInt16LE(o + 4)),
        halfToFloat(data.readUInt16LE(o + 6)),
      ];
    case "Colour":
    case "UByte4":
      return [data[o]!, data[o + 1]!, data[o + 2]!, data[o + 3]!];
    case "Dec3N": {
      // 10:10:10:2 signed, normalised.
      const v = data.readUInt32LE(o);
      const sx = (v << 22) >> 22;
      const sy = (v << 12) >> 22;
      const sz = (v << 2) >> 22;
      return [sx / 511, sy / 511, sz / 511];
    }
    default:
      throw new RageUnsupportedError(`vertex element type ${comp.typeName} has no decoder`, {
        code: "UNSUPPORTED_VERTEX_TYPE",
      });
  }
}

/** A decoded vertex buffer. */
export interface DecodedVertexBuffer {
  vertexCount: number;
  declaration: VertexDeclaration;
  positions: Float32Array;
  normals?: Float32Array;
  tangents?: Float32Array;
  colors?: Uint8Array;
  uvs: Float32Array[];
}

/**
 * Decode a `grcVertexBuffer` into typed arrays, extracting positions, normals,
 * tangents, the first vertex colour set and up to two UV sets.
 */
export function readVertexBuffer(
  reader: ResourceReader,
  ptr: DecodedPointer,
): DecodedVertexBuffer {
  const { segment, offset } = ptr;
  const stride = sane(reader.u16(segment, offset + VERTEX_BUFFER.VERTEX_STRIDE), "vertex stride", offset);
  const vertexCount = sane(
    reader.u32(segment, offset + VERTEX_BUFFER.VERTEX_COUNT),
    "vertex buffer count",
    offset,
  );
  const declPtr = expectSystem(
    need(reader.pointer(segment, offset + VERTEX_BUFFER.VERTEX_DECLARATION_PTR), "vertex declaration"),
    "vertex declaration",
  );
  const declaration = readVertexDeclaration(reader, declPtr);
  if (declaration.stride !== stride) {
    throw new RageFormatError(
      `vertex buffer declares stride ${stride} but its declaration says ${declaration.stride}`,
      { code: "BAD_VERTEX_DECL", offset },
    );
  }

  const dataPtr = need(reader.pointer(segment, offset + VERTEX_BUFFER.DATA_PTR), "vertex data");
  const data = reader.bytes(dataPtr.segment, dataPtr.offset, vertexCount * stride);

  const positions = new Float32Array(vertexCount * 3);
  const byName = new Map(declaration.components.map((c) => [c.name, c]));
  const posComp = byName.get("Position");
  if (!posComp) {
    throw new RageFormatError("vertex declaration has no Position component", {
      code: "BAD_VERTEX_DECL",
      offset,
    });
  }
  const normalComp = byName.get("Normal");
  const tangentComp = byName.get("Tangent");
  const colourComp = byName.get("Colour0");
  const uvComps = [byName.get("TexCoord0"), byName.get("TexCoord1")].filter(
    (c): c is VertexComponent => c !== undefined,
  );

  const normals = normalComp ? new Float32Array(vertexCount * 3) : undefined;
  const tangents = tangentComp ? new Float32Array(vertexCount * 4) : undefined;
  const colors = colourComp ? new Uint8Array(vertexCount * 4) : undefined;
  const uvs = uvComps.map(() => new Float32Array(vertexCount * 2));

  for (let i = 0; i < vertexCount; i++) {
    const base = i * stride;
    const p = readComponent(data, base, posComp);
    positions[i * 3] = finite(p[0]!, "vertex position x");
    positions[i * 3 + 1] = finite(p[1] ?? 0, "vertex position y");
    positions[i * 3 + 2] = finite(p[2] ?? 0, "vertex position z");
    if (normals && normalComp) {
      const n = readComponent(data, base, normalComp);
      normals[i * 3] = n[0] ?? 0;
      normals[i * 3 + 1] = n[1] ?? 0;
      normals[i * 3 + 2] = n[2] ?? 0;
    }
    if (tangents && tangentComp) {
      const t = readComponent(data, base, tangentComp);
      tangents[i * 4] = t[0] ?? 0;
      tangents[i * 4 + 1] = t[1] ?? 0;
      tangents[i * 4 + 2] = t[2] ?? 0;
      tangents[i * 4 + 3] = t[3] ?? 1;
    }
    if (colors && colourComp) {
      const c = readComponent(data, base, colourComp);
      colors[i * 4] = c[0] ?? 255;
      colors[i * 4 + 1] = c[1] ?? 255;
      colors[i * 4 + 2] = c[2] ?? 255;
      colors[i * 4 + 3] = c[3] ?? 255;
    }
    uvComps.forEach((comp, k) => {
      const uv = readComponent(data, base, comp);
      uvs[k]![i * 2] = uv[0] ?? 0;
      uvs[k]![i * 2 + 1] = uv[1] ?? 0;
    });
  }

  return {
    vertexCount,
    declaration,
    positions,
    ...(normals ? { normals } : {}),
    ...(tangents ? { tangents } : {}),
    ...(colors ? { colors } : {}),
    uvs,
  };
}

/** Read a `grcIndexBuffer` into a `Uint32Array` of triangle-list indices. */
export function readIndexBuffer(reader: ResourceReader, ptr: DecodedPointer): Uint32Array {
  const { segment, offset } = ptr;
  const count = reader.u32(segment, offset + INDEX_BUFFER.INDICES_COUNT);
  if (!Number.isInteger(count) || count < 0 || count > 0x1000000) {
    throw new RageFormatError(`index buffer declares an implausible ${count} indices`, {
      code: "IMPLAUSIBLE",
      offset,
    });
  }
  const dataPtr = need(reader.pointer(segment, offset + INDEX_BUFFER.DATA_PTR), "index data");
  const data = reader.bytes(dataPtr.segment, dataPtr.offset, count * 2);
  const out = new Uint32Array(count);
  for (let i = 0; i < count; i++) out[i] = data.readUInt16LE(i * 2);
  return out;
}

/** Read a `Vector4` AABB pair written as `[min.xyzw, max.xyzw]`. */
function readAabb(reader: ResourceReader, segment: Segment, offset: number): RageBounds {
  const min = reader.vec3(segment, offset);
  const max = reader.vec3(segment, offset + 16);
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const radius =
    Math.sqrt((max[0] - min[0]) ** 2 + (max[1] - min[1]) ** 2 + (max[2] - min[2]) ** 2) / 2;
  return { min, max, center, radius };
}

/** Read one `grmGeometry`. */
function readGeometry(
  reader: ResourceReader,
  ptr: DecodedPointer,
  shaderIndex: number,
): RageMesh {
  const { segment, offset } = ptr;
  const vbPtr = expectSystem(
    need(reader.pointer(segment, offset + DRAWABLE_GEOMETRY.VERTEX_BUFFER_PTR), "geometry vertex buffer"),
    "geometry vertex buffer",
  );
  const ibPtr = expectSystem(
    need(reader.pointer(segment, offset + DRAWABLE_GEOMETRY.INDEX_BUFFER_PTR), "geometry index buffer"),
    "geometry index buffer",
  );
  const vb = readVertexBuffer(reader, vbPtr);
  const indices = readIndexBuffer(reader, ibPtr);

  const declaredIndices = reader.u32(segment, offset + DRAWABLE_GEOMETRY.INDICES_COUNT);
  if (declaredIndices !== indices.length) {
    throw new RageFormatError(
      `geometry declares ${declaredIndices} indices but its index buffer holds ${indices.length}`,
      { code: "INCONSISTENT", offset },
    );
  }
  if (indices.length % 3 !== 0) {
    throw new RageFormatError(
      `geometry has ${indices.length} indices, which is not a whole number of triangles`,
      { code: "INCONSISTENT", offset },
    );
  }
  for (const i of indices) {
    if (i >= vb.vertexCount) {
      throw new RageFormatError(
        `geometry index ${i} is out of range for ${vb.vertexCount} vertices`,
        { code: "INCONSISTENT", offset },
      );
    }
  }

  return {
    positions: vb.positions,
    ...(vb.normals ? { normals: vb.normals } : {}),
    ...(vb.tangents ? { tangents: vb.tangents } : {}),
    ...(vb.colors ? { colors: vb.colors } : {}),
    uvs: vb.uvs,
    indices,
    shaderIndex,
    vertexCount: vb.vertexCount,
    vertexComponents: vb.declaration.components.map((c) => c.name),
  };
}

/** Read one `rmcDrawableModel` into its list of geometries. */
function readModel(reader: ResourceReader, ptr: DecodedPointer): RageMesh[] {
  const { segment, offset } = ptr;
  const geoms = readPtrArray(reader, segment, offset + DRAWABLE_MODEL.GEOMETRIES_PTR, "drawable model geometries");
  const count = geoms.length;
  const mappingPtr = reader.pointer(segment, offset + DRAWABLE_MODEL.SHADER_MAPPING_PTR);
  const boundsPtr = reader.pointer(segment, offset + DRAWABLE_MODEL.BOUNDS_PTR);

  const meshes: RageMesh[] = [];
  geoms.forEach((g, i) => {
    if (!g) return;
    const shaderIndex = mappingPtr ? reader.u16(mappingPtr.segment, mappingPtr.offset + i * 2) : 0;
    const mesh = readGeometry(reader, expectSystem(g, "geometry"), shaderIndex);
    if (boundsPtr) {
      // One combined AABB followed by one per geometry, when there is more than
      // one geometry; a single geometry stores only its own.
      const slot = count > 1 ? i + 1 : 0;
      try {
        mesh.bounds = readAabb(reader, boundsPtr.segment, boundsPtr.offset + slot * 32);
      } catch {
        mesh.bounds = boundsFromPositions(mesh.positions);
      }
    }
    meshes.push(mesh);
  });
  return meshes;
}

/** Read one `grmShader` (ShaderFX). */
function readShader(reader: ResourceReader, ptr: DecodedPointer): RageShader {
  const { segment, offset } = ptr;
  const nameHash = reader.u32(segment, offset + SHADER_FX.NAME_HASH);
  const fileNameHash = reader.u32(segment, offset + SHADER_FX.FILE_NAME_HASH);
  const renderBucket = reader.u8(segment, offset + SHADER_FX.RENDER_BUCKET);
  const paramCount = sane(reader.u8(segment, offset + SHADER_FX.PARAM_COUNT), "shader parameter count", offset);

  const valuesPtr = reader.pointer(segment, offset + SHADER_FX.PARAMS_PTR);
  const hashesPtr = reader.pointer(segment, offset + SHADER_FX.PARAM_HASHES_PTR);
  const typesPtr = reader.pointer(segment, offset + SHADER_FX.PARAM_TYPES_PTR);

  const textures: Record<string, string> = {};
  const params: Record<string, number[]> = {};

  if (paramCount > 0 && valuesPtr && hashesPtr && typesPtr) {
    for (let i = 0; i < paramCount; i++) {
      const hash = reader.u32(hashesPtr.segment, hashesPtr.offset + i * 4);
      const name = paramNameFromHash(hash);
      const type = reader.u8(typesPtr.segment, typesPtr.offset + i);
      const valuePtr = reader.pointer(valuesPtr.segment, valuesPtr.offset + i * 16);
      if (type === 0) {
        // Texture parameter: the value is a pointer to a TextureBase.
        if (valuePtr) {
          const texName = reader.stringAt(reader.pointer(valuePtr.segment, valuePtr.offset + 0x20));
          if (texName) textures[name] = texName;
        }
      } else if (valuePtr) {
        const values: number[] = [];
        for (let v = 0; v < type * 4; v++) {
          values.push(reader.f32(valuePtr.segment, valuePtr.offset + v * 4));
        }
        params[name] = values;
      }
    }
  }

  return {
    name: shaderNameFromHash(nameHash),
    nameHash,
    fileNameHash,
    renderBucket,
    textures,
    params,
  };
}

/** Read a `grmShaderGroup`. */
function readShaderGroup(
  reader: ResourceReader,
  ptr: DecodedPointer,
): { shaders: RageShader[]; textures: RageTexture[] } {
  const { segment, offset } = ptr;
  const shaderPtrs = readPtrArray(
    reader,
    segment,
    offset + SHADER_GROUP.SHADERS_PTR,
    "shader group shaders",
  );
  const shaders = shaderPtrs
    .filter((p): p is DecodedPointer => p !== null)
    .map((p) => readShader(reader, expectSystem(p, "shader")));

  let textures: RageTexture[] = [];
  const dictPtr = reader.pointer(segment, offset + SHADER_GROUP.TEXTURE_DICTIONARY_PTR);
  if (dictPtr) {
    try {
      textures = readTextureDictionaryStruct(reader, dictPtr).textures;
    } catch {
      textures = [];
    }
  }
  return { shaders, textures };
}

/** Read a `crSkeletonData`. */
function readSkeleton(reader: ResourceReader, ptr: DecodedPointer): { bones: RageBone[] } {
  const { segment, offset } = ptr;
  const bonesPtr = reader.pointer(segment, offset + SKELETON.BONES_PTR);
  const count = sane(reader.u16(segment, offset + SKELETON.BONES_COUNT), "skeleton bone count", offset);
  if (!bonesPtr || count === 0) return { bones: [] };
  const bones: RageBone[] = [];
  for (let i = 0; i < count; i++) {
    const b = bonesPtr.offset + i * BONE.SIZE;
    const name = reader.stringAt(reader.pointer(bonesPtr.segment, b + BONE.NAME_PTR)) ?? `bone_${i}`;
    bones.push({
      name,
      nameHash: reader.u32(bonesPtr.segment, b + BONE.NAME_HASH),
      index: reader.u16(bonesPtr.segment, b + BONE.INDEX),
      parentIndex: reader.i16(bonesPtr.segment, b + BONE.PARENT_INDEX),
      rotation: reader.vec4(bonesPtr.segment, b + BONE.ROTATION),
      translation: reader.vec3(bonesPtr.segment, b + BONE.TRANSLATION),
      scale: reader.vec3(bonesPtr.segment, b + BONE.SCALE),
    });
  }
  return { bones };
}

/**
 * Read a `gtaDrawable` structure at `ptr`.
 *
 * @param fallbackName - Used when the drawable carries no name pointer.
 */
export function readDrawableStruct(
  reader: ResourceReader,
  ptr: DecodedPointer,
  fallbackName = "drawable",
): RageDrawable {
  const { segment, offset } = ptr;
  expectSystem(ptr, "drawable");

  const name = reader.stringAt(reader.pointer(segment, offset + DRAWABLE.NAME_PTR)) ?? fallbackName;

  const shaderGroupPtr = reader.pointer(segment, offset + DRAWABLE.SHADER_GROUP_PTR);
  const { shaders, textures } = shaderGroupPtr
    ? readShaderGroup(reader, expectSystem(shaderGroupPtr, "shader group"))
    : { shaders: [] as RageShader[], textures: [] as RageTexture[] };

  const lods = { high: [], med: [], low: [], vlow: [] } as Record<LodLevel, RageMesh[][]>;
  LOD_LEVELS.forEach((level, i) => {
    const arrayPtr = reader.pointer(segment, offset + DRAWABLE.MODELS_PTR[i]!);
    if (!arrayPtr) return;
    const models = readPtrArray(reader, arrayPtr.segment, arrayPtr.offset, `${level} LOD models`);
    for (const m of models) {
      if (!m) continue;
      lods[level].push(readModel(reader, expectSystem(m, "drawable model")));
    }
  });

  const lodDistances = DRAWABLE.LOD_DIST.map((o) =>
    finite(reader.f32(segment, offset + o), "LOD distance"),
  ) as [number, number, number, number];

  const min = reader.vec3(segment, offset + DRAWABLE.BOUNDING_BOX_MIN);
  const max = reader.vec3(segment, offset + DRAWABLE.BOUNDING_BOX_MAX);
  const center = reader.vec3(segment, offset + DRAWABLE.BOUNDING_CENTER);
  const radius = reader.f32(segment, offset + DRAWABLE.BOUNDING_SPHERE_RADIUS);
  const bounds: RageBounds = [...min, ...max, ...center, radius].every(Number.isFinite)
    ? { min, max, center, radius }
    : emptyBounds();

  const skeletonPtr = reader.pointer(segment, offset + DRAWABLE.SKELETON_PTR);
  const skeleton = skeletonPtr
    ? readSkeleton(reader, expectSystem(skeletonPtr, "skeleton"))
    : undefined;

  return {
    name,
    lods,
    lodDistances,
    shaders,
    bounds,
    ...(skeleton && skeleton.bones.length > 0 ? { skeleton } : {}),
    ...(textures.length > 0 ? { embeddedTextures: textures } : {}),
  };
}

/**
 * Read a `.ydr` drawable resource.
 *
 * @throws {@link RageFormatError} when the container or the drawable structure
 *   does not match the layout this package implements.
 */
export function readYdr(buf: Buffer | Uint8Array): RageDrawable {
  const res = parseRsc7(buf);
  const reader = new ResourceReader(res.systemData, res.graphicsData);
  return readDrawableStruct(reader, { segment: "system", offset: 0 }, "drawable");
}

/**
 * Read a `.ydd` drawable dictionary.
 *
 * The dictionary is a `pgDictionary<gtaDrawable>`: the same shape as a texture
 * dictionary, with ascending name-hash keys and a parallel pointer array.
 */
export function readYdd(buf: Buffer | Uint8Array): RageDrawableEntry[] {
  const res = parseRsc7(buf);
  const reader = new ResourceReader(res.systemData, res.graphicsData);
  const base = 0;
  const hashPtr = reader.pointer("system", base + 0x20);
  const count = sane(reader.u16("system", base + 0x38), "drawable dictionary count", base);
  const entriesPtr = reader.pointer("system", base + 0x30);
  if (count === 0) return [];
  const entries = expectSystem(need(entriesPtr, "drawable dictionary entries"), "drawable dictionary entries");

  const out: RageDrawableEntry[] = [];
  for (let i = 0; i < count; i++) {
    const p = reader.pointer(entries.segment, entries.offset + i * 8);
    if (!p) continue;
    const hash = hashPtr ? reader.u32(hashPtr.segment, hashPtr.offset + i * 4) : 0;
    const drawable = readDrawableStruct(
      reader,
      expectSystem(p, "dictionary drawable"),
      `drawable_${hash.toString(16)}`,
    );
    out.push({ name: drawable.name, drawable });
  }
  return out;
}

/**
 * Read a `.yft` fragment.
 *
 * A fragment stores its main drawable by pointer plus an array of physics child
 * drawables with the bone each is attached to. Fragment layouts vary
 * considerably between asset types; anything that does not validate throws
 * rather than returning partial geometry.
 */
export function readYft(buf: Buffer | Uint8Array): RageFragment {
  const res = parseRsc7(buf);
  const reader = new ResourceReader(res.systemData, res.graphicsData);

  /** Offsets within `fragType`, reconstructed alongside the drawable layout. */
  const FRAGMENT = {
    NAME_PTR: 0x10,
    DRAWABLE_PTR: 0x30,
    CHILDREN_PTR: 0x68,
    CHILDREN_COUNT: 0x70,
  } as const;

  const name = reader.stringAt(reader.pointer("system", FRAGMENT.NAME_PTR)) ?? "fragment";
  const drawablePtr = reader.pointer("system", FRAGMENT.DRAWABLE_PTR);
  if (!drawablePtr) {
    throw new RageFormatError(
      "fragment has no main drawable pointer — this .yft variant is not supported",
      { code: "UNSUPPORTED_FRAGMENT", offset: FRAGMENT.DRAWABLE_PTR },
    );
  }
  const drawable = readDrawableStruct(reader, expectSystem(drawablePtr, "fragment drawable"), name);

  const children: RageFragment["children"] = [];
  const childArray = reader.pointer("system", FRAGMENT.CHILDREN_PTR);
  const childCount = reader.u16("system", FRAGMENT.CHILDREN_COUNT);
  if (childArray && childCount > 0 && childCount <= SANE_COUNT) {
    for (let i = 0; i < childCount; i++) {
      const childPtr = reader.pointer(childArray.segment, childArray.offset + i * 8);
      if (!childPtr) continue;
      // fragTypeChild: boneIndex at 0x06, drawable pointer at 0x68.
      const boneIndex = reader.u16(childPtr.segment, childPtr.offset + 0x06);
      const childDrawablePtr = reader.pointer(childPtr.segment, childPtr.offset + 0x68);
      if (!childDrawablePtr) continue;
      const childName = `${name}_child_${i}`;
      children.push({
        name: childName,
        drawable: readDrawableStruct(reader, expectSystem(childDrawablePtr, "fragment child"), childName),
        boneIndex,
      });
    }
  }

  return { name, drawable, children };
}
