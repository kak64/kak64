import { describe, expect, it } from "vitest";
import { readDrawableStruct, readYdr } from "./drawable.js";
import { ResourceReader } from "./binary.js";
import { writeYdr, type DrawableInput } from "./writer.js";
import { readYbn, writeYbn } from "./bounds.js";
import { parseRsc7, RESOURCE_VERSIONS } from "./rsc7.js";
import { RageFormatError } from "./errors.js";

/** A unit cube as a triangle list with per-vertex UVs and colours. */
function cube(scale = 1) {
  const p: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const faces: Array<[number[], number[], number[], number[]]> = [
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
    [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
    [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
    [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
  ];
  faces.forEach((face, f) => {
    const base = f * 4;
    face.forEach((v, i) => {
      p.push(v[0]! * scale, v[1]! * scale, v[2]! * scale);
      uv.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
      col.push(255, (f * 40) & 0xff, 128, 255);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { positions: p, uvs: [uv], colors: col, indices: idx };
}

const input: DrawableInput = {
  name: "prop_test_crate",
  shaders: [
    { name: "normal_spec", textures: { DiffuseSampler: "crate_d", BumpSampler: "crate_n", SpecSampler: "crate_s" } },
    { name: "default", textures: { DiffuseSampler: "crate_lod" }, params: { bumpiness: [1, 0, 0, 0] } },
  ],
  lods: [
    { distance: 60, meshes: [{ ...cube(1), shaderIndex: 0 }, { ...cube(0.5), shaderIndex: 1 }] },
    { distance: 120, meshes: [{ ...cube(1), shaderIndex: 1 }] },
    { distance: 300, meshes: [{ ...cube(1), shaderIndex: 1 }] },
    { distance: 600, meshes: [{ ...cube(1), shaderIndex: 1 }] },
  ],
};

describe("writeYdr → readYdr round trip", () => {
  const file = writeYdr(input);
  const drawable = readYdr(file);

  it("produces a valid RSC7 .ydr", () => {
    const res = parseRsc7(file);
    expect(res.version).toBe(RESOURCE_VERSIONS.ydr);
    expect(res.graphicsSize).toBeGreaterThan(0);
  });

  it("preserves the drawable name", () => {
    expect(drawable.name).toBe("prop_test_crate");
  });

  it("preserves LOD distances", () => {
    expect(drawable.lodDistances).toEqual([60, 120, 300, 600]);
  });

  it("preserves the LOD/model/geometry nesting", () => {
    expect(drawable.lods.high).toHaveLength(1); // one DrawableModel
    expect(drawable.lods.high[0]).toHaveLength(2); // two geometries
    expect(drawable.lods.med[0]).toHaveLength(1);
    expect(drawable.lods.low[0]).toHaveLength(1);
    expect(drawable.lods.vlow[0]).toHaveLength(1);
  });

  it("preserves geometry arrays exactly", () => {
    const mesh = drawable.lods.high[0]![0]!;
    const src = input.lods[0]!.meshes[0]!;
    expect(mesh.vertexCount).toBe(24);
    expect(Array.from(mesh.positions)).toEqual(Array.from(src.positions));
    expect(Array.from(mesh.indices)).toEqual(Array.from(src.indices));
    expect(Array.from(mesh.uvs[0]!)).toEqual(Array.from(src.uvs![0]!));
    expect(Array.from(mesh.colors!)).toEqual(Array.from(src.colors!));
    expect(mesh.normals).toBeDefined();
    expect(mesh.normals!.length).toBe(24 * 3);
  });

  it("preserves shader indices per geometry", () => {
    expect(drawable.lods.high[0]!.map((m) => m.shaderIndex)).toEqual([0, 1]);
    expect(drawable.lods.med[0]![0]!.shaderIndex).toBe(1);
  });

  it("preserves shader names and texture references", () => {
    expect(drawable.shaders).toHaveLength(2);
    expect(drawable.shaders[0]!.name).toBe("normal_spec");
    expect(drawable.shaders[0]!.textures).toEqual({
      DiffuseSampler: "crate_d",
      BumpSampler: "crate_n",
      SpecSampler: "crate_s",
    });
    expect(drawable.shaders[1]!.name).toBe("default");
    expect(drawable.shaders[1]!.textures).toEqual({ DiffuseSampler: "crate_lod" });
    expect(drawable.shaders[1]!.params.bumpiness).toEqual([1, 0, 0, 0]);
  });

  it("preserves bounds", () => {
    expect(drawable.bounds.min).toEqual([-1, -1, -1]);
    expect(drawable.bounds.max).toEqual([1, 1, 1]);
    expect(drawable.bounds.radius).toBeCloseTo(Math.sqrt(3), 5);
  });

  it("records the vertex components the buffer declared", () => {
    expect(drawable.lods.high[0]![0]!.vertexComponents).toEqual([
      "Position",
      "Normal",
      "Colour0",
      "TexCoord0",
    ]);
  });

  it("carries per-geometry bounds", () => {
    const [big, small] = drawable.lods.high[0]!;
    expect(big!.bounds!.max[0]).toBeCloseTo(1, 5);
    expect(small!.bounds!.max[0]).toBeCloseTo(0.5, 5);
  });

  it("round-trips a second time unchanged", () => {
    const again = readYdr(writeYdr(input));
    expect(again.name).toBe(drawable.name);
    expect(Array.from(again.lods.high[0]![0]!.positions)).toEqual(
      Array.from(drawable.lods.high[0]![0]!.positions),
    );
  });

  it("supports a tangent channel and a second UV set", () => {
    const base = cube();
    const vertexCount = base.positions.length / 3;
    const tangents = new Float32Array(vertexCount * 4).fill(0.5);
    const uv2 = new Float32Array(vertexCount * 2).fill(0.25);
    const mesh = readYdr(
      writeYdr({
        ...input,
        lods: [
          {
            distance: 50,
            meshes: [{ ...base, uvs: [base.uvs[0]!, uv2], tangents, shaderIndex: 0 }],
          },
        ],
      }),
    ).lods.high[0]![0]!;
    expect(mesh.vertexComponents).toContain("Tangent");
    expect(mesh.uvs).toHaveLength(2);
    expect(mesh.uvs[1]![0]).toBeCloseTo(0.25, 5);
    expect(mesh.tangents![3]).toBeCloseTo(0.5, 5);
  });
});

describe("writeYdr validation", () => {
  it("rejects an empty LOD list", () => {
    expect(() => writeYdr({ ...input, lods: [] })).toThrow(/at least one LOD/);
  });
  it("rejects more than four LODs", () => {
    expect(() => writeYdr({ ...input, lods: [...input.lods, input.lods[0]!] })).toThrow(/at most 4 LODs/);
  });
  it("rejects an out-of-range shader index", () => {
    expect(() =>
      writeYdr({ ...input, lods: [{ distance: 1, meshes: [{ ...cube(), shaderIndex: 9 }] }] }),
    ).toThrow(/shaderIndex 9 is out of range/);
  });
  it("rejects an out-of-range vertex index", () => {
    const bad = cube();
    bad.indices[0] = 9999;
    expect(() =>
      writeYdr({ ...input, lods: [{ distance: 1, meshes: [{ ...bad, shaderIndex: 0 }] }] }),
    ).toThrow(/out of range for 24 vertices/);
  });
  it("rejects an unsupported shader name", () => {
    expect(() =>
      // @ts-expect-error deliberately out of the supported set
      writeYdr({ ...input, shaders: [{ name: "vehicle_paint1", textures: { DiffuseSampler: "x" } }] }),
    ).toThrow(/native writer supports shaders/);
  });
  it("rejects a shader with no DiffuseSampler", () => {
    expect(() =>
      // @ts-expect-error deliberately missing the required sampler
      writeYdr({ ...input, shaders: [{ name: "default", textures: {} }] }),
    ).toThrow(/no DiffuseSampler/);
  });
});

describe("readYdr on malformed input", () => {
  it("throws a typed error rather than returning garbage", () => {
    expect(() => readYdr(Buffer.alloc(32))).toThrow(RageFormatError);
  });

  it("throws when the structure layout does not line up", () => {
    const res = parseRsc7(writeYdr(input));
    const scrambled = Buffer.from(res.systemData.map((b) => b ^ 0xff));
    expect(() =>
      readDrawableStruct(new ResourceReader(scrambled, res.graphicsData), {
        segment: "system",
        offset: 0,
      }),
    ).toThrow(RageFormatError);
  });
});

describe("writeYbn → readYbn round trip", () => {
  const mesh = cube(2);

  it("round-trips a box child", () => {
    const bound = readYbn(writeYbn({ children: [{ type: "box", min: [-1, -2, -3], max: [4, 5, 6], materialIndex: 2 }] }));
    expect(bound.type).toBe("Composite");
    expect(bound.children).toHaveLength(1);
    const box = bound.children![0]!;
    expect(box.type).toBe("Box");
    expect(box.bounds.min).toEqual([-1, -2, -3]);
    expect(box.bounds.max).toEqual([4, 5, 6]);
    expect(box.materialIndex).toBe(2);
  });

  it("round-trips a BVH triangle mesh within quantisation error", () => {
    const bound = readYbn(
      writeYbn({
        children: [
          {
            type: "bvh",
            positions: mesh.positions,
            indices: mesh.indices,
            materialIndices: mesh.indices.map((_, i) => i % 3),
          },
        ],
        materials: [0x11, 0x22, 0x33],
      }),
    );
    const bvh = bound.children![0]!;
    expect(bvh.type).toBe("BVH");
    expect(Array.from(bvh.indices!)).toEqual(mesh.indices);
    expect(bvh.positions!.length).toBe(mesh.positions.length);
    for (let i = 0; i < mesh.positions.length; i++) {
      expect(bvh.positions![i]!).toBeCloseTo(mesh.positions[i]!, 3);
    }
    expect(bvh.materials).toEqual([0x11, 0x22, 0x33]);
    expect(bvh.polygonMaterials![0]).toBe(0);
    expect(bvh.polygonMaterials![1]).toBe(1);
  });

  it("round-trips a composite of both kinds and unions their bounds", () => {
    const bound = readYbn(
      writeYbn({
        children: [
          { type: "box", min: [-5, -5, -5], max: [-4, -4, -4] },
          { type: "bvh", positions: mesh.positions, indices: mesh.indices },
        ],
      }),
    );
    expect(bound.children).toHaveLength(2);
    expect(bound.bounds.min[0]).toBeCloseTo(-5, 5);
    expect(bound.bounds.max[0]).toBeCloseTo(2, 5);
  });

  it("validates its input", () => {
    expect(() => writeYbn({ children: [] })).toThrow(/at least one child/);
    expect(() =>
      writeYbn({ children: [{ type: "bvh", positions: [0, 0, 0, 1, 1, 1, 2, 2, 2], indices: [0, 1] }] }),
    ).toThrow(/not a multiple of 3/);
    expect(() =>
      writeYbn({ children: [{ type: "bvh", positions: [0, 0, 0], indices: [0, 1, 2] }] }),
    ).toThrow(/out of range/);
  });
});
