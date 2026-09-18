import { describe, expect, it } from "vitest";
import { ResourceBuilder } from "./binary.js";
import { readYdd, readYft } from "./drawable.js";
import { buildDrawable, writeYdd, type DrawableInput } from "./writer.js";
import { parseRsc7, RESOURCE_VERSIONS, writeRsc7 } from "./rsc7.js";
import { joaat } from "./hash.js";
import { RageFormatError } from "./errors.js";

function tri(scale: number, shaderIndex = 0) {
  return {
    positions: [0, 0, 0, scale, 0, 0, scale, scale, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [[0, 0, 1, 0, 1, 1]],
    indices: [0, 1, 2],
    shaderIndex,
  };
}

function drawableInput(name: string, scale: number): DrawableInput {
  return {
    name,
    shaders: [{ name: "default", textures: { DiffuseSampler: `${name}_d` } }],
    lods: [{ distance: 100, meshes: [tri(scale)] }],
  };
}

describe("writeYdd → readYdd round trip", () => {
  const entries = [
    { drawable: drawableInput("jbib_000_u", 1) },
    { drawable: drawableInput("accs_diff_000_a_uni", 2) },
    { drawable: drawableInput("lowr_000_r", 3) },
  ];

  it("produces a valid RSC7 .ydd", () => {
    const res = parseRsc7(writeYdd(entries));
    expect(res.version).toBe(RESOURCE_VERSIONS.ydd);
  });

  it("reads every drawable back with its name and geometry", () => {
    const read = readYdd(writeYdd(entries));
    expect(read).toHaveLength(3);
    const byName = new Map(read.map((e) => [e.name, e.drawable]));
    expect([...byName.keys()].sort()).toEqual(
      ["accs_diff_000_a_uni", "jbib_000_u", "lowr_000_r"].sort(),
    );
    expect(byName.get("lowr_000_r")!.lods.high[0]![0]!.positions[3]).toBeCloseTo(3, 5);
    expect(byName.get("jbib_000_u")!.shaders[0]!.textures.DiffuseSampler).toBe("jbib_000_u_d");
  });

  it("sorts entries by ascending name hash", () => {
    const read = readYdd(writeYdd(entries));
    const hashes = read.map((e) => joaat(e.name));
    expect(hashes).toEqual([...hashes].sort((a, b) => a - b));
  });

  it("handles an empty dictionary and rejects duplicates", () => {
    expect(readYdd(writeYdd([]))).toEqual([]);
    expect(() =>
      writeYdd([
        { name: "same", drawable: drawableInput("a", 1) },
        { name: "Same", drawable: drawableInput("b", 1) },
      ]),
    ).toThrow(/collide on name hash/);
  });
});

/**
 * Build a synthetic `.yft` with the fragment field offsets `readYft`
 * implements, so the fragment walk itself is exercised end to end.
 */
function synthesizeYft(name: string, childCount: number): Buffer {
  const builder = new ResourceBuilder();
  const fragment = builder.system({ size: 0x80, align: 16, label: "fragType" });
  const main = buildDrawable(builder, drawableInput(`${name}_main`, 1));

  const childPointers = builder.system({ align: 16, label: "childPointers" });
  const children = [];
  for (let i = 0; i < childCount; i++) {
    const child = builder.system({ size: 0x80, align: 16, label: `fragTypeChild:${i}` });
    const childDrawable = buildDrawable(builder, drawableInput(`${name}_child_${i}`, 2 + i));
    child.seek(0x06).u16(i + 1); // bone index
    child.seek(0x68).pointer(childDrawable).u32(0);
    children.push(child);
  }
  for (const c of children) childPointers.pointer(c).u32(0);

  fragment.seek(0x00).u32(0).u32(1).u64(0n);
  fragment.seek(0x10).pointer(builder.string(name)).u32(0);
  fragment.seek(0x30).pointer(main).u32(0);
  fragment.seek(0x68).pointer(childCount > 0 ? childPointers : null).u32(0);
  fragment.seek(0x70).u16(childCount);

  const built = builder.build();
  return writeRsc7({
    version: RESOURCE_VERSIONS.yft,
    system: built.system,
    graphics: built.graphics,
    systemMinBaseSize: built.largestSystemBlock,
    graphicsMinBaseSize: built.largestGraphicsBlock,
  });
}

describe("readYft", () => {
  it("reads the fragment name and its main drawable", () => {
    const fragment = readYft(synthesizeYft("adder", 0));
    expect(fragment.name).toBe("adder");
    expect(fragment.drawable.name).toBe("adder_main");
    expect(fragment.drawable.lods.high[0]![0]!.vertexCount).toBe(3);
    expect(fragment.children).toEqual([]);
  });

  it("reads physics children with their bone indices and geometry", () => {
    const fragment = readYft(synthesizeYft("adder", 3));
    expect(fragment.children).toHaveLength(3);
    expect(fragment.children.map((c) => c.boneIndex)).toEqual([1, 2, 3]);
    expect(fragment.children[0]!.drawable.name).toBe("adder_child_0");
    expect(fragment.children[2]!.drawable.lods.high[0]![0]!.positions[3]).toBeCloseTo(4, 5);
  });

  it("throws when the fragment has no main drawable", () => {
    const builder = new ResourceBuilder();
    builder.system({ size: 0x80, align: 16, label: "emptyFragment" });
    const built = builder.build();
    const file = writeRsc7({ version: RESOURCE_VERSIONS.yft, system: built.system });
    expect(() => readYft(file)).toThrow(/no main drawable pointer/);
  });

  it("throws on a non-RSC7 buffer", () => {
    expect(() => readYft(Buffer.alloc(16))).toThrow(RageFormatError);
    expect(() => readYdd(Buffer.alloc(16))).toThrow(RageFormatError);
  });
});
