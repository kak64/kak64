/**
 * Byte layouts of the GTA V (PC, 64-bit) drawable and bound resource
 * structures.
 *
 * > **Provenance warning.** Unlike {@link ./rsc7.js | RSC7} and
 * > {@link ./ytd.js | texture dictionaries}, the offsets in this file are
 * > *reconstructed from public documentation of the RAGE resource structures*
 * > and have **not** been verified against retail game files. They are the
 * > single source of truth shared by this package's drawable reader and
 * > drawable writer, so the two are self-consistent and round-trip — but a real
 * > `.ydr` may use offsets that differ.
 * >
 * > Readers built on this table validate aggressively (pointer segments,
 * > counts, strides, finite floats) and throw
 * > {@link ../errors.js | RageFormatError} rather than returning plausible-
 * > looking garbage. Production export goes through the CodeWalker XML
 * > emitters, which do not depend on any of this.
 *
 * All structures begin with `ResourceFileBase`/`pgBase`-style words:
 * `u32 VFT`, `u32 unknown = 1`, then 64-bit fields. Every pointer field is 8
 * bytes wide; only the low 32 bits carry the tagged resource pointer.
 *
 * @packageDocumentation
 */

/** Offsets within `gtaDrawable`. */
export const DRAWABLE = {
  SIZE: 0xd0,
  VFT: 0x00,
  SHADER_GROUP_PTR: 0x10,
  SKELETON_PTR: 0x18,
  BOUNDING_CENTER: 0x20,
  BOUNDING_SPHERE_RADIUS: 0x2c,
  BOUNDING_BOX_MIN: 0x30,
  BOUNDING_BOX_MAX: 0x40,
  /** Four `pgPtrArray<rmcDrawableModel>` pointers, high → very low. */
  MODELS_PTR: [0x50, 0x58, 0x60, 0x68] as const,
  /** Four LOD switch distances, high → very low. */
  LOD_DIST: [0x70, 0x74, 0x78, 0x7c] as const,
  /** Four render-bucket masks, high → very low. */
  RENDER_MASK: [0x80, 0x84, 0x88, 0x8c] as const,
  JOINTS_PTR: 0x90,
  NAME_PTR: 0xa8,
} as const;

/** `pgPtrArray<T>`: a pointer to an array of 64-bit pointers plus a count. */
export const PTR_ARRAY = {
  SIZE: 0x10,
  ENTRIES_PTR: 0x00,
  COUNT: 0x08,
  CAPACITY: 0x0a,
} as const;

/** Offsets within `rmcDrawableModel`. */
export const DRAWABLE_MODEL = {
  SIZE: 0x30,
  VFT: 0x00,
  GEOMETRIES_PTR: 0x08,
  GEOMETRIES_COUNT: 0x10,
  GEOMETRIES_CAPACITY: 0x12,
  /** `Vector4[]` AABBs: one combined box then one per geometry when count > 1. */
  BOUNDS_PTR: 0x18,
  /** `u16[]` mapping each geometry to a shader index in the shader group. */
  SHADER_MAPPING_PTR: 0x20,
  /** Bit 0 = has skin; bits 8–15 = bone count. */
  FLAGS: 0x28,
} as const;

/** Offsets within `grmGeometry`. */
export const DRAWABLE_GEOMETRY = {
  SIZE: 0x60,
  VFT: 0x00,
  VERTEX_BUFFER_PTR: 0x10,
  INDEX_BUFFER_PTR: 0x30,
  INDICES_COUNT: 0x40,
  TRIANGLES_COUNT: 0x44,
  VERTEX_COUNT: 0x48,
  VERTEX_STRIDE: 0x4a,
  BONE_IDS_PTR: 0x50,
  BONE_IDS_COUNT: 0x58,
} as const;

/** Offsets within `grcVertexBuffer`. */
export const VERTEX_BUFFER = {
  SIZE: 0x80,
  VFT: 0x00,
  VERTEX_STRIDE: 0x08,
  VERTEX_COUNT: 0x10,
  /** Primary vertex data pointer (graphics segment). */
  DATA_PTR: 0x18,
  VERTEX_DECLARATION_PTR: 0x30,
  /** Shadow copy of the data pointer that real resources also carry. */
  DATA_PTR2: 0x50,
} as const;

/** Offsets within `grcIndexBuffer`. */
export const INDEX_BUFFER = {
  SIZE: 0x60,
  VFT: 0x00,
  INDICES_COUNT: 0x08,
  /** `u16[]` index data (graphics segment). */
  DATA_PTR: 0x10,
} as const;

/** Offsets within `grcVertexDeclaration`. */
export const VERTEX_DECLARATION = {
  SIZE: 0x10,
  /** 4 bits per component slot describing its element type. */
  TYPES: 0x00,
  /** One bit per component slot: whether the slot is present. */
  FLAGS: 0x08,
  STRIDE: 0x0c,
  /** Always 0x0D for GTA V vertex declarations. */
  UNKNOWN_E: 0x0e,
  COUNT: 0x0f,
} as const;

/** Offsets within `grmShaderGroup`. */
export const SHADER_GROUP = {
  SIZE: 0x40,
  VFT: 0x00,
  TEXTURE_DICTIONARY_PTR: 0x08,
  SHADERS_PTR: 0x10,
  SHADERS_COUNT: 0x18,
  SHADERS_CAPACITY: 0x1a,
} as const;

/** Offsets within `grmShader` (ShaderFX). */
export const SHADER_FX = {
  SIZE: 0x40,
  /** `pgArray` of parameter values (pointers or inline vectors). */
  PARAMS_PTR: 0x00,
  /** `u32[]` of parameter name hashes. */
  PARAM_HASHES_PTR: 0x08,
  PARAM_COUNT: 0x20,
  /** Render bucket (0 opaque, 1 alpha, 2 decal, 3 cutout, …). */
  RENDER_BUCKET: 0x22,
  /** joaat of the `.sps` file name, e.g. `normal_spec`. */
  NAME_HASH: 0x30,
  /** joaat of the shader preset / file name. */
  FILE_NAME_HASH: 0x34,
  /** `u8[]` of parameter data sizes, parallel to the hash array. */
  PARAM_SIZES_PTR: 0x10,
  /** `u8[]` of parameter types: 0 = texture, N = N 16-byte vectors. */
  PARAM_TYPES_PTR: 0x18,
} as const;

/** Offsets within `crSkeletonData`. */
export const SKELETON = {
  SIZE: 0x70,
  VFT: 0x00,
  BONES_PTR: 0x20,
  BONES_COUNT: 0x28,
  TRANSFORMS_INV_PTR: 0x10,
  TRANSFORMS_PTR: 0x18,
} as const;

/** Offsets within `crBoneData`. */
export const BONE = {
  SIZE: 0x50,
  NAME_PTR: 0x00,
  FLAGS: 0x08,
  /** Index of this bone, its parent, and its next sibling. */
  INDEX: 0x0e,
  PARENT_INDEX: 0x32,
  SIBLING_INDEX: 0x34,
  ROTATION: 0x10,
  TRANSLATION: 0x20,
  SCALE: 0x30,
  NAME_HASH: 0x48,
} as const;

/**
 * Component slots in a `grcVertexDeclaration`, indexed by bit position in the
 * declaration's `flags` word.
 */
export const VERTEX_COMPONENTS = [
  "Position",
  "BlendWeights",
  "BlendIndices",
  "Normal",
  "Colour0",
  "Colour1",
  "TexCoord0",
  "TexCoord1",
  "TexCoord2",
  "TexCoord3",
  "TexCoord4",
  "TexCoord5",
  "TexCoord6",
  "TexCoord7",
  "Tangent",
  "Binormal",
] as const;

/** Name of a vertex component slot. */
export type VertexComponentName = (typeof VERTEX_COMPONENTS)[number];

/** Element types a vertex component can use, indexed by its 4-bit type code. */
export const VERTEX_ELEMENT_TYPES = [
  { name: "Half2", size: 4, count: 2 },
  { name: "Float", size: 4, count: 1 },
  { name: "Half4", size: 8, count: 4 },
  { name: "FloatUnused", size: 4, count: 1 },
  { name: "Float", size: 4, count: 1 },
  { name: "Float2", size: 8, count: 2 },
  { name: "Float3", size: 12, count: 3 },
  { name: "Float4", size: 16, count: 4 },
  { name: "UByte4", size: 4, count: 4 },
  { name: "Colour", size: 4, count: 4 },
  { name: "Dec3N", size: 4, count: 3 },
  { name: "Unused11", size: 0, count: 0 },
  { name: "Unused12", size: 0, count: 0 },
  { name: "Unused13", size: 0, count: 0 },
  { name: "Unused14", size: 0, count: 0 },
  { name: "Unused15", size: 0, count: 0 },
] as const;

/** Type code for `Float3` components (positions, normals). */
export const VT_FLOAT3 = 6;
/** Type code for `Float2` components (texture coordinates). */
export const VT_FLOAT2 = 5;
/** Type code for `Float4` components (tangents). */
export const VT_FLOAT4 = 7;
/** Type code for packed BGRA colour components. */
export const VT_COLOUR = 9;
