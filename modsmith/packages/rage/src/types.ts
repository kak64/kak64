/**
 * Public shapes returned by the drawable readers.
 *
 * @packageDocumentation
 */

import type { RageTexture } from "./ytd.js";

/** The four level-of-detail slots a drawable carries. */
export type LodLevel = "high" | "med" | "low" | "vlow";

/** LOD slots in the order they appear in the resource. */
export const LOD_LEVELS: readonly LodLevel[] = ["high", "med", "low", "vlow"];

/** An axis-aligned box plus the bounding sphere the resource stores with it. */
export interface RageBounds {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  radius: number;
}

/** One geometry: a single draw call's worth of vertices and indices. */
export interface RageMesh {
  /** `vertexCount * 3` floats. */
  positions: Float32Array;
  /** `vertexCount * 3` floats, when the vertex format carries normals. */
  normals?: Float32Array;
  /** `vertexCount * 4` floats, when the vertex format carries tangents. */
  tangents?: Float32Array;
  /** Up to two UV sets, each `vertexCount * 2` floats. */
  uvs: Float32Array[];
  /** `vertexCount * 4` bytes of RGBA vertex colour, when present. */
  colors?: Uint8Array;
  /** Triangle list indices. */
  indices: Uint32Array;
  /** Index into {@link RageDrawable.shaders}. */
  shaderIndex: number;
  vertexCount: number;
  /** Names of the vertex components the source buffer declared. */
  vertexComponents: string[];
  /** Per-geometry AABB, when the model stored one. */
  bounds?: RageBounds;
}

/** A shader (`grmShader`) with its resolved parameter names. */
export interface RageShader {
  /** Resolved shader name, e.g. `vehicle_paint1`, or `hash_XXXXXXXX`. */
  name: string;
  /** joaat hash the name was resolved from. */
  nameHash: number;
  /** joaat hash of the shader's preset/file name. */
  fileNameHash: number;
  /** Render bucket: 0 opaque, 1 alpha, 2 decal, 3 cutout. */
  renderBucket: number;
  /** Texture parameters: parameter name → texture name. */
  textures: Record<string, string>;
  /** Numeric parameters: parameter name → flattened vector values. */
  params: Record<string, number[]>;
}

/** One bone of a drawable's skeleton. */
export interface RageBone {
  name: string;
  nameHash: number;
  index: number;
  /** Index of the parent bone, or -1 for a root. */
  parentIndex: number;
  translation: [number, number, number];
  /** Quaternion, xyzw. */
  rotation: [number, number, number, number];
  scale: [number, number, number];
}

/** A drawable's skeleton, when it has one. */
export interface RageSkeleton {
  bones: RageBone[];
}

/** A drawable (`.ydr`, or one embedded in a `.yft` / `.ydd`). */
export interface RageDrawable {
  name: string;
  /** Each LOD holds one entry per `DrawableModel`, each a list of geometries. */
  lods: Record<LodLevel, RageMesh[][]>;
  /** LOD switch distances, high → very low. */
  lodDistances: [number, number, number, number];
  shaders: RageShader[];
  bounds: RageBounds;
  /** Present only for skinned drawables. */
  skeleton?: RageSkeleton;
  /** Textures embedded in the drawable's own shader group, if any. */
  embeddedTextures?: RageTexture[];
}

/** A `.yft` fragment: a main drawable plus its physics children. */
export interface RageFragment {
  name: string;
  drawable: RageDrawable;
  children: Array<{ name: string; drawable: RageDrawable; boneIndex: number }>;
}

/** One entry of a `.ydd` drawable dictionary. */
export interface RageDrawableEntry {
  name: string;
  drawable: RageDrawable;
}

/** An empty bounds value, used when a resource carries none. */
export function emptyBounds(): RageBounds {
  return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], radius: 0 };
}

/** Compute bounds from a flat `xyz` position array. */
export function boundsFromPositions(positions: ArrayLike<number>): RageBounds {
  if (positions.length < 3) return emptyBounds();
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i + c] as number;
      if (v < min[c]!) min[c] = v;
      if (v > max[c]!) max[c] = v;
    }
  }
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  let radius = 0;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const dx = (positions[i] as number) - center[0];
    const dy = (positions[i + 1] as number) - center[1];
    const dz = (positions[i + 2] as number) - center[2];
    radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }
  return { min, max, center, radius };
}

/** Union of two bounds. */
export function mergeBounds(a: RageBounds, b: RageBounds): RageBounds {
  const min: [number, number, number] = [
    Math.min(a.min[0], b.min[0]),
    Math.min(a.min[1], b.min[1]),
    Math.min(a.min[2], b.min[2]),
  ];
  const max: [number, number, number] = [
    Math.max(a.max[0], b.max[0]),
    Math.max(a.max[1], b.max[1]),
    Math.max(a.max[2], b.max[2]),
  ];
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const radius =
    Math.sqrt(
      (max[0] - min[0]) ** 2 + (max[1] - min[1]) ** 2 + (max[2] - min[2]) ** 2,
    ) / 2;
  return { min, max, center, radius };
}
