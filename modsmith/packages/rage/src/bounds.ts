/**
 * Static bounds (`.ybn`): `phBoundComposite` holding box and BVH
 * triangle-mesh children.
 *
 * > **Best-effort, same provenance warning as {@link ./layout.js}.** The
 * > offsets below are reconstructed from public documentation of the RAGE
 * > physics bound structures and are **not verified against retail game
 * > files**. {@link writeYbn} and {@link readYbn} share this table, so they
 * > round-trip; `CAPABILITIES.ybn` is `"xml-only"` because game-loadability is
 * > unproven, and {@link ../xml.js | ybnXml} is the production export path.
 *
 * BVH vertices are stored the way the format describes them: 16-bit
 * quantised offsets from the bound's centre, scaled by a per-bound `quantum`.
 * Round-tripping therefore reproduces positions to within one quantum.
 *
 * @packageDocumentation
 */

import { ResourceBuilder, ResourceReader, type Block, type DecodedPointer } from "./binary.js";
import { RageFormatError, RageUnsupportedError } from "./errors.js";
import { parseRsc7, RESOURCE_VERSIONS, writeRsc7 } from "./rsc7.js";
import { boundsFromPositions, emptyBounds, type RageBounds } from "./types.js";

/** `phBound` type codes. */
export const BOUND_TYPE = {
  Sphere: 0,
  Capsule: 1,
  Box: 3,
  Geometry: 4,
  BVH: 8,
  Composite: 10,
  Disc: 12,
  Cylinder: 13,
} as const;

/** Names of the bound types this library knows. */
export type RageBoundType = keyof typeof BOUND_TYPE;

/** Offsets within `phBound`, shared by every bound type. */
export const BOUND = {
  SIZE: 0x70,
  VFT: 0x00,
  TYPE: 0x08,
  MARGIN_PAD: 0x09,
  REF_COUNT: 0x0a,
  BOX_MAX: 0x10,
  MARGIN: 0x1c,
  BOX_MIN: 0x20,
  BOX_CENTER: 0x30,
  SPHERE_CENTER: 0x40,
  SPHERE_RADIUS: 0x4c,
  VOLUME: 0x50,
  MATERIAL_INDEX: 0x60,
} as const;

/** Extra offsets for `phBoundComposite`. */
export const BOUND_COMPOSITE = {
  SIZE: 0xa0,
  CHILDREN_PTR: 0x70,
  CHILD_TRANSFORMS_PTR: 0x78,
  CHILD_TRANSFORMS_INV_PTR: 0x80,
  CHILD_BOUNDS_PTR: 0x88,
  CHILDREN_COUNT: 0x90,
  CHILDREN_CAPACITY: 0x92,
} as const;

/** Extra offsets for `phBoundGeometry` / `phBoundBVH`. */
export const BOUND_GEOMETRY = {
  SIZE: 0x100,
  /** `u64[]` of packed material definitions. */
  MATERIALS_PTR: 0x78,
  /** Polygon array (16 bytes each). */
  POLYGONS_PTR: 0x90,
  QUANTUM: 0x98,
  CENTER_GEOM: 0xa8,
  /** `i16[3]` quantised vertices. */
  VERTICES_PTR: 0xb8,
  VERTICES_COUNT: 0xd8,
  POLYGONS_COUNT: 0xdc,
  MATERIALS_COUNT: 0xe0,
} as const;

/** Bytes per polygon record. */
export const POLYGON_SIZE = 16;
/** Polygon type code for a triangle. */
export const POLYGON_TRIANGLE = 1;

/** A bound read from a `.ybn`. */
export interface RageBound {
  type: RageBoundType;
  /** Box and sphere extents stored on the bound. */
  bounds: RageBounds;
  margin: number;
  materialIndex: number;
  /** Children, for a `Composite`. */
  children?: RageBound[];
  /** Dequantised triangle-mesh vertices, for `BVH` / `Geometry`. */
  positions?: Float32Array;
  /** Triangle indices, for `BVH` / `Geometry`. */
  indices?: Uint32Array;
  /** One material index per triangle. */
  polygonMaterials?: Uint8Array;
  /** The bound's material id table. */
  materials?: number[];
}

/** A box child handed to {@link writeYbn}. */
export interface BoxBoundInput {
  type: "box";
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  /** Index into the composite's material table (default 0). */
  materialIndex?: number;
}

/** A triangle-mesh child handed to {@link writeYbn}. */
export interface BvhBoundInput {
  type: "bvh";
  /** Flat `xyz` positions. */
  positions: ArrayLike<number>;
  /** Triangle-list indices into `positions`. */
  indices: ArrayLike<number>;
  /** Per-triangle material index; defaults to `materialIndex` for all. */
  materialIndices?: ArrayLike<number>;
  materialIndex?: number;
}

/** One child of the composite bound. */
export type BoundChildInput = BoxBoundInput | BvhBoundInput;

/** Input to {@link writeYbn}. */
export interface BoundInput {
  children: BoundChildInput[];
  /**
   * Material ids referenced by children, in table order. RAGE packs surface
   * properties into these; this writer stores them verbatim.
   */
  materials?: number[];
}

function vec3Of(b: Block, v: readonly number[] | ArrayLike<number>, w = 0): void {
  b.f32(v[0] as number)
    .f32(v[1] as number)
    .f32(v[2] as number)
    .f32(w);
}

function writeBoundBase(
  block: Block,
  type: number,
  bounds: RageBounds,
  margin: number,
  materialIndex: number,
): void {
  block.seek(BOUND.VFT).u32(0).u32(1);
  block.seek(BOUND.TYPE).u8(type).u8(0).u16(1).u32(0);
  block.seek(BOUND.BOX_MAX);
  vec3Of(block, bounds.max, margin);
  block.seek(BOUND.BOX_MIN);
  vec3Of(block, bounds.min);
  block.seek(BOUND.BOX_CENTER);
  vec3Of(block, bounds.center);
  block.seek(BOUND.SPHERE_CENTER);
  vec3Of(block, bounds.center, bounds.radius);
  const volume =
    (bounds.max[0] - bounds.min[0]) *
    (bounds.max[1] - bounds.min[1]) *
    (bounds.max[2] - bounds.min[2]);
  block.seek(BOUND.VOLUME).f32(volume);
  block.seek(BOUND.MATERIAL_INDEX).u32(materialIndex).u32(0);
}

/**
 * Build a native RSC7 `.ybn` holding a `phBoundComposite` of box and BVH
 * children.
 *
 * @throws {@link RageFormatError} for empty input or malformed geometry.
 */
export function writeYbn(input: BoundInput): Buffer {
  if (input.children.length === 0) {
    throw new RageFormatError("writeYbn needs at least one child bound", { code: "BAD_INPUT" });
  }
  const builder = new ResourceBuilder();
  const composite = builder.system({ size: BOUND_COMPOSITE.SIZE, align: 16, label: "BoundComposite" });
  const childPointers = builder.system({ align: 16, label: "childPointers" });
  const childTransforms = builder.system({ align: 16, label: "childTransforms" });
  const childBoxes = builder.system({ align: 16, label: "childBounds" });

  const childBlocks: Block[] = [];
  let total = emptyBounds();
  let first = true;

  for (const child of input.children) {
    if (child.type === "box") {
      const min = [...child.min] as [number, number, number];
      const max = [...child.max] as [number, number, number];
      const center: [number, number, number] = [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ];
      const radius =
        Math.sqrt((max[0] - min[0]) ** 2 + (max[1] - min[1]) ** 2 + (max[2] - min[2]) ** 2) / 2;
      const bounds: RageBounds = { min, max, center, radius };
      const block = builder.system({ size: BOUND.SIZE, align: 16, label: "BoundBox" });
      writeBoundBase(block, BOUND_TYPE.Box, bounds, 0.04, child.materialIndex ?? 0);
      childBlocks.push(block);
      total = first ? bounds : unionBounds(total, bounds);
      first = false;
      continue;
    }

    const positions = Float32Array.from(child.positions as ArrayLike<number>);
    const indices = Uint32Array.from(child.indices as ArrayLike<number>);
    if (positions.length % 3 !== 0) {
      throw new RageFormatError(`BVH bound positions length ${positions.length} is not a multiple of 3`, {
        code: "BAD_INPUT",
      });
    }
    if (indices.length % 3 !== 0) {
      throw new RageFormatError(`BVH bound index count ${indices.length} is not a multiple of 3`, {
        code: "BAD_INPUT",
      });
    }
    const vertexCount = positions.length / 3;
    if (vertexCount > 0xffff) {
      throw new RageUnsupportedError(
        `BVH bound has ${vertexCount} vertices; the 16-bit vertex indices cap it at 65535`,
        { code: "TOO_MANY_VERTICES" },
      );
    }
    for (const i of indices) {
      if (i >= vertexCount) {
        throw new RageFormatError(`BVH bound index ${i} is out of range for ${vertexCount} vertices`, {
          code: "BAD_INPUT",
        });
      }
    }
    const bounds = boundsFromPositions(positions);
    const extent = Math.max(
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
      1e-6,
    );
    // 16-bit signed quantisation of offsets from the bound centre.
    const quantum = extent / 65000;

    const block = builder.system({ size: BOUND_GEOMETRY.SIZE, align: 16, label: "BoundBVH" });
    writeBoundBase(block, BOUND_TYPE.BVH, bounds, 0.04, child.materialIndex ?? 0);

    const vertexBlock = builder.system({ align: 16, label: "bvhVertices" });
    for (let v = 0; v < vertexCount; v++) {
      for (let c = 0; c < 3; c++) {
        const q = Math.round((positions[v * 3 + c]! - bounds.center[c]!) / quantum);
        vertexBlock.i16(Math.max(-32768, Math.min(32767, q)));
      }
    }

    const triCount = indices.length / 3;
    const polyBlock = builder.system({ align: 16, label: "bvhPolygons" });
    for (let t = 0; t < triCount; t++) {
      const mat = child.materialIndices
        ? (child.materialIndices[t] as number) & 0xff
        : ((child.materialIndex ?? 0) & 0xff);
      polyBlock
        .u8(POLYGON_TRIANGLE)
        .u8(mat)
        .u16(0)
        .u16(indices[t * 3]!)
        .u16(indices[t * 3 + 1]!)
        .u16(indices[t * 3 + 2]!)
        .u16(0)
        .u16(0)
        .u16(0);
    }

    const materials = input.materials ?? [0];
    const materialBlock = builder.system({ align: 16, label: "bvhMaterials" });
    for (const m of materials) materialBlock.u32(m >>> 0).u32(0);

    block.seek(BOUND_GEOMETRY.MATERIALS_PTR).pointer(materialBlock).u32(0);
    block.seek(BOUND_GEOMETRY.POLYGONS_PTR).pointer(polyBlock).u32(0);
    block.seek(BOUND_GEOMETRY.QUANTUM);
    vec3Of(block, [quantum, quantum, quantum], 1);
    block.seek(BOUND_GEOMETRY.CENTER_GEOM);
    vec3Of(block, bounds.center);
    block.seek(BOUND_GEOMETRY.VERTICES_PTR).pointer(vertexBlock).u32(0);
    block.seek(BOUND_GEOMETRY.VERTICES_COUNT).u32(vertexCount).u32(triCount);
    block.seek(BOUND_GEOMETRY.MATERIALS_COUNT).u8(materials.length).u8(0).u16(0);

    childBlocks.push(block);
    total = first ? bounds : unionBounds(total, bounds);
    first = false;
  }

  for (const b of childBlocks) childPointers.pointer(b).u32(0);
  for (let i = 0; i < childBlocks.length; i++) {
    // Identity 3×4 transform per child (rows padded to Vector4).
    childTransforms.f32(1).f32(0).f32(0).f32(0);
    childTransforms.f32(0).f32(1).f32(0).f32(0);
    childTransforms.f32(0).f32(0).f32(1).f32(0);
    childTransforms.f32(0).f32(0).f32(0).f32(1);
  }
  for (const child of input.children) {
    const b =
      child.type === "box"
        ? { min: [...child.min], max: [...child.max] }
        : (() => {
            const bb = boundsFromPositions(Float32Array.from(child.positions as ArrayLike<number>));
            return { min: bb.min, max: bb.max };
          })();
    vec3Of(childBoxes, b.min);
    vec3Of(childBoxes, b.max);
  }

  writeBoundBase(composite, BOUND_TYPE.Composite, total, 0.04, 0);
  composite.seek(BOUND_COMPOSITE.CHILDREN_PTR).pointer(childPointers).u32(0);
  composite.seek(BOUND_COMPOSITE.CHILD_TRANSFORMS_PTR).pointer(childTransforms).u32(0);
  composite.seek(BOUND_COMPOSITE.CHILD_TRANSFORMS_INV_PTR).pointer(childTransforms).u32(0);
  composite.seek(BOUND_COMPOSITE.CHILD_BOUNDS_PTR).pointer(childBoxes).u32(0);
  composite
    .seek(BOUND_COMPOSITE.CHILDREN_COUNT)
    .u16(childBlocks.length)
    .u16(childBlocks.length);

  const built = builder.build();
  return writeRsc7({
    version: RESOURCE_VERSIONS.ybn,
    system: built.system,
    graphics: built.graphics,
    systemMinBaseSize: built.largestSystemBlock,
  });
}

function unionBounds(a: RageBounds, b: RageBounds): RageBounds {
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
    Math.sqrt((max[0] - min[0]) ** 2 + (max[1] - min[1]) ** 2 + (max[2] - min[2]) ** 2) / 2;
  return { min, max, center, radius };
}

function typeName(code: number): RageBoundType {
  for (const [name, value] of Object.entries(BOUND_TYPE)) {
    if (value === code) return name as RageBoundType;
  }
  throw new RageUnsupportedError(`unknown phBound type code ${code}`, { code: "UNKNOWN_BOUND_TYPE" });
}

function readBoundStruct(reader: ResourceReader, ptr: DecodedPointer): RageBound {
  const { segment, offset } = ptr;
  const type = typeName(reader.u8(segment, offset + BOUND.TYPE));
  const max = reader.vec3(segment, offset + BOUND.BOX_MAX);
  const min = reader.vec3(segment, offset + BOUND.BOX_MIN);
  const center = reader.vec3(segment, offset + BOUND.BOX_CENTER);
  const radius = reader.f32(segment, offset + BOUND.SPHERE_RADIUS);
  const margin = reader.f32(segment, offset + BOUND.MARGIN);
  const materialIndex = reader.u32(segment, offset + BOUND.MATERIAL_INDEX);
  const bound: RageBound = {
    type,
    bounds: { min, max, center, radius },
    margin,
    materialIndex,
  };

  if (type === "Composite") {
    const listPtr = reader.pointer(segment, offset + BOUND_COMPOSITE.CHILDREN_PTR);
    const count = reader.u16(segment, offset + BOUND_COMPOSITE.CHILDREN_COUNT);
    if (count > 0xffff) {
      throw new RageFormatError(`composite bound declares ${count} children`, { code: "IMPLAUSIBLE" });
    }
    bound.children = [];
    if (listPtr) {
      for (let i = 0; i < count; i++) {
        const childPtr = reader.pointer(listPtr.segment, listPtr.offset + i * 8);
        if (!childPtr) continue;
        bound.children.push(readBoundStruct(reader, childPtr));
      }
    }
    return bound;
  }

  if (type === "BVH" || type === "Geometry") {
    const vertexCount = reader.u32(segment, offset + BOUND_GEOMETRY.VERTICES_COUNT);
    const polyCount = reader.u32(segment, offset + BOUND_GEOMETRY.POLYGONS_COUNT);
    if (vertexCount > 0xffff || polyCount > 0xffffff) {
      throw new RageFormatError(
        `geometry bound declares ${vertexCount} vertices and ${polyCount} polygons`,
        { code: "IMPLAUSIBLE", offset },
      );
    }
    const quantum = reader.vec3(segment, offset + BOUND_GEOMETRY.QUANTUM);
    const centerGeom = reader.vec3(segment, offset + BOUND_GEOMETRY.CENTER_GEOM);
    const vertPtr = reader.pointer(segment, offset + BOUND_GEOMETRY.VERTICES_PTR);
    const polyPtr = reader.pointer(segment, offset + BOUND_GEOMETRY.POLYGONS_PTR);

    const positions = new Float32Array(vertexCount * 3);
    if (vertPtr) {
      for (let v = 0; v < vertexCount; v++) {
        for (let c = 0; c < 3; c++) {
          const q = reader.i16(vertPtr.segment, vertPtr.offset + (v * 3 + c) * 2);
          positions[v * 3 + c] = q * quantum[c]! + centerGeom[c]!;
        }
      }
    }
    const indices = new Uint32Array(polyCount * 3);
    const polygonMaterials = new Uint8Array(polyCount);
    if (polyPtr) {
      for (let t = 0; t < polyCount; t++) {
        const o = polyPtr.offset + t * POLYGON_SIZE;
        const polyType = reader.u8(polyPtr.segment, o);
        if (polyType !== POLYGON_TRIANGLE) {
          throw new RageUnsupportedError(
            `bound polygon ${t} has type ${polyType}; only triangles (type 1) are supported`,
            { code: "UNSUPPORTED_POLYGON", offset: o },
          );
        }
        polygonMaterials[t] = reader.u8(polyPtr.segment, o + 1);
        indices[t * 3] = reader.u16(polyPtr.segment, o + 4);
        indices[t * 3 + 1] = reader.u16(polyPtr.segment, o + 6);
        indices[t * 3 + 2] = reader.u16(polyPtr.segment, o + 8);
      }
    }
    bound.positions = positions;
    bound.indices = indices;
    bound.polygonMaterials = polygonMaterials;

    const matCount = reader.u8(segment, offset + BOUND_GEOMETRY.MATERIALS_COUNT);
    const matPtr = reader.pointer(segment, offset + BOUND_GEOMETRY.MATERIALS_PTR);
    if (matPtr && matCount > 0) {
      bound.materials = [];
      for (let m = 0; m < matCount; m++) {
        bound.materials.push(reader.u32(matPtr.segment, matPtr.offset + m * 8));
      }
    }
  }

  return bound;
}

/**
 * Read a `.ybn` static bound.
 *
 * @throws {@link RageFormatError} / {@link RageUnsupportedError} for bound
 *   types or polygon kinds this library does not implement.
 */
export function readYbn(buf: Buffer | Uint8Array): RageBound {
  const res = parseRsc7(buf);
  const reader = new ResourceReader(res.systemData, res.graphicsData);
  return readBoundStruct(reader, { segment: "system", offset: 0 });
}
