import { describe, expect, it } from "vitest";
import { parseMtl, parseObj } from "./obj";
import { computeBounds, triangleCount } from "./mesh";

const CUBE_FACE = `
# a quad plus a triangle, two materials
mtllib cube.mtl
o cube
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
vn 0 0 1
usemtl body
f 1/1/1 2/2/1 3/3/1 4/4/1
usemtl trim
f 1/1/1 2/2/1 3/3/1
`;

describe("parseObj", () => {
  it("triangulates quads and splits meshes per material", () => {
    const { meshes, materialNames, mtllib } = parseObj(CUBE_FACE);
    expect(mtllib).toEqual(["cube.mtl"]);
    expect(materialNames.sort()).toEqual(["body", "trim"]);
    expect(meshes).toHaveLength(2);
    const body = meshes.find((m) => m.material === "body")!;
    expect(body.indices.length).toBe(6); // quad → 2 triangles
    expect(triangleCount(meshes)).toBe(3);
    expect(body.positions.length / 3).toBe(4);
    expect(body.uvs).toBeDefined();
    expect(body.normals).toBeDefined();
  });

  it("flips V into the glTF convention", () => {
    const { meshes } = parseObj("v 0 0 0\nv 1 0 0\nv 1 1 0\nvt 0 0.25\nvt 1 0.25\nvt 1 1\nf 1/1 2/2 3/3\n");
    expect(meshes[0]!.uvs![1]).toBeCloseTo(0.75, 6);
  });

  it("resolves negative indices relative to the end of the vertex list", () => {
    const { meshes } = parseObj("v 0 0 0\nv 1 0 0\nv 1 1 0\nf -3 -2 -1\n");
    expect(meshes).toHaveLength(1);
    const p = meshes[0]!.positions;
    expect(Array.from(p.slice(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(p.slice(6, 9))).toEqual([1, 1, 0]);
  });

  it("de-duplicates repeated v/vt/vn tuples", () => {
    const { meshes } = parseObj("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3\nf 1 3 4\n");
    expect(meshes[0]!.positions.length / 3).toBe(4);
    expect(meshes[0]!.indices.length).toBe(6);
  });

  it("computes bounds over the parsed geometry", () => {
    const { meshes } = parseObj("v -1 -2 -3\nv 4 5 6\nv 0 0 0\nf 1 2 3\n");
    const bounds = computeBounds(meshes);
    expect(bounds.min).toEqual([-1, -2, -3]);
    expect(bounds.max).toEqual([4, 5, 6]);
    expect(bounds.size).toEqual([5, 7, 9]);
  });

  it("ignores comments, blank lines and unknown statements", () => {
    const { meshes } = parseObj("# hi\n\ns off\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    expect(triangleCount(meshes)).toBe(1);
  });
});

describe("parseMtl", () => {
  it("reads colours and map paths, dropping map options", () => {
    const entries = parseMtl(`
newmtl body
Kd 0.8 0.2 0.1
Ns 250
d 0.5
map_Kd -s 1 1 1 textures/body_d.png
map_Bump -bm 1.0 textures/body_n.png
newmtl trim
Kd 1 1 1
`);
    expect(entries).toHaveLength(2);
    const body = entries[0]!;
    expect(body.kd).toEqual([0.8, 0.2, 0.1]);
    expect(body.d).toBe(0.5);
    expect(body.mapKd).toBe("textures/body_d.png");
    expect(body.mapBump).toBe("textures/body_n.png");
    expect(entries[1]!.name).toBe("trim");
  });

  it("converts Tr to d", () => {
    expect(parseMtl("newmtl x\nTr 0.25\n")[0]!.d).toBeCloseTo(0.75, 6);
  });
});
