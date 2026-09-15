import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { crc32, encodePng, isPng } from "./png.js";
import { drawableToGlb, GLB_CHUNK_BIN, GLB_CHUNK_JSON, GLB_MAGIC, parseGlb } from "./glb.js";
import { readYdr } from "./drawable.js";
import { writeYdr, type DrawableInput } from "./writer.js";
import { readYtd, writeYtd } from "./ytd.js";
import { encodeDds } from "./dds.js";
import { RageFormatError } from "./errors.js";

function gradient(w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = i & 0xff;
    out[i * 4 + 1] = (i * 3) & 0xff;
    out[i * 4 + 2] = (i * 7) & 0xff;
    out[i * 4 + 3] = 255;
  }
  return out;
}

describe("PNG encoder", () => {
  it("writes the signature and the required chunks in order", () => {
    const png = encodePng(gradient(8, 4), 8, 4);
    expect(isPng(png)).toBe(true);
    expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(8); // width
    expect(png.readUInt32BE(20)).toBe(4); // height
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(6); // RGBA
    expect(png.subarray(png.length - 8, png.length - 4).toString("latin1")).toBe("IEND");
  });

  it("writes valid CRCs for every chunk", () => {
    const png = encodePng(gradient(4, 4), 4, 4);
    let at = 8;
    let chunks = 0;
    while (at < png.length) {
      const len = png.readUInt32BE(at);
      const body = png.subarray(at + 4, at + 8 + len);
      expect(png.readUInt32BE(at + 8 + len)).toBe(crc32(body));
      at += 12 + len;
      chunks++;
    }
    expect(chunks).toBe(3);
  });

  it("produces IDAT that inflates to filtered scanlines of the right size", () => {
    const width = 6;
    const height = 3;
    const png = encodePng(gradient(width, height), width, height);
    const idatLength = png.readUInt32BE(33);
    const idat = png.subarray(41, 41 + idatLength);
    const raw = inflateSync(idat);
    expect(raw.length).toBe((width * 4 + 1) * height);
    // Each scanline starts with a filter byte in 0…4.
    for (let y = 0; y < height; y++) {
      expect(raw[y * (width * 4 + 1)]).toBeLessThanOrEqual(4);
    }
  });

  it("validates its input", () => {
    expect(() => encodePng(new Uint8Array(4), 0, 1)).toThrow(RageFormatError);
    expect(() => encodePng(new Uint8Array(4), 4, 4)).toThrow(/expected 64/);
  });
});

/* -------------------------------------------------------------------------- */

function quad(shaderIndex: number) {
  return {
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [[0, 0, 1, 0, 1, 1, 0, 1]],
    colors: [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255],
    indices: [0, 1, 2, 0, 2, 3],
    shaderIndex,
  };
}

const drawableInput: DrawableInput = {
  name: "prop_glb_test",
  shaders: [
    { name: "normal_spec", textures: { DiffuseSampler: "tex_d", BumpSampler: "tex_n" } },
    { name: "default", textures: { DiffuseSampler: "tex_lod" } },
  ],
  lods: [
    { distance: 40, meshes: [quad(0), quad(1)] },
    { distance: 90, meshes: [quad(1)] },
  ],
};

const textures = readYtd(
  writeYtd([
    { name: "tex_d", dds: encodeDds(gradient(16, 16), 16, 16, { format: "DXT1", mips: true }) },
    { name: "tex_n", dds: encodeDds(gradient(8, 8), 8, 8, { format: "A8R8G8B8" }) },
  ]),
);

describe("drawableToGlb", () => {
  const drawable = readYdr(writeYdr(drawableInput));
  const glb = drawableToGlb(drawable, textures);
  const parsed = parseGlb(glb);
  const json = parsed.json as Record<string, any>;

  it("emits a valid GLB container", () => {
    expect(glb.readUInt32LE(0)).toBe(GLB_MAGIC);
    expect(glb.readUInt32LE(4)).toBe(2);
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    expect(glb.readUInt32LE(16)).toBe(GLB_CHUNK_JSON);
    const jsonLength = glb.readUInt32LE(12);
    expect(jsonLength % 4).toBe(0);
    expect(glb.readUInt32LE(20 + jsonLength + 4)).toBe(GLB_CHUNK_BIN);
    expect(parsed.bin.length % 4).toBe(0);
  });

  it("emits a structurally valid glTF document", () => {
    expect(json.asset.version).toBe("2.0");
    expect(json.scenes).toHaveLength(1);
    expect(json.scenes[0].nodes.length).toBeGreaterThan(0);
    expect(json.buffers).toHaveLength(1);
    expect(json.buffers[0].byteLength).toBe(parsed.bin.length);
    for (const view of json.bufferViews) {
      expect(view.buffer).toBe(0);
      expect(view.byteOffset + view.byteLength).toBeLessThanOrEqual(parsed.bin.length);
      expect(view.byteOffset % 4).toBe(0);
    }
    for (const accessor of json.accessors) {
      expect(json.bufferViews[accessor.bufferView]).toBeDefined();
      expect(accessor.count).toBeGreaterThan(0);
    }
    for (const mesh of json.meshes) {
      for (const prim of mesh.primitives) {
        expect(prim.attributes.POSITION).toBeTypeOf("number");
        expect(json.materials[prim.material]).toBeDefined();
        expect(prim.mode).toBe(4);
      }
    }
  });

  it("emits one primitive per geometry, high LOD only by default", () => {
    expect(json.meshes).toHaveLength(1);
    expect(json.meshes[0].primitives).toHaveLength(2);
    expect(json.extras.lods).toEqual(["high"]);
  });

  it("includes both LODs when asked", () => {
    const both = parseGlb(drawableToGlb(drawable, textures, { lods: ["high", "med"] }))
      .json as Record<string, any>;
    expect(both.meshes).toHaveLength(2);
    expect(both.meshes[1].primitives[0].extras.lod).toBe("med");
  });

  it("carries per-primitive extras", () => {
    const extras = json.meshes[0].primitives[0].extras;
    expect(extras.shaderIndex).toBe(0);
    expect(extras.shaderName).toBe("normal_spec");
    expect(extras.lod).toBe("high");
    expect(extras.modelName).toBe("prop_glb_test_high_0");
  });

  it("names materials after the shader and diffuse texture and carries their textures", () => {
    expect(json.materials[0].name).toBe("normal_spec__tex_d");
    expect(json.materials[1].name).toBe("default__tex_lod");
    expect(json.materials[0].extras.textures).toEqual({
      DiffuseSampler: "tex_d",
      BumpSampler: "tex_n",
    });
  });

  it("embeds decodable textures as PNG and skips missing ones", () => {
    expect(json.images).toHaveLength(2); // tex_d and tex_n; tex_lod has no texture
    const image = json.images[0];
    const view = json.bufferViews[image.bufferView];
    const png = parsed.bin.subarray(view.byteOffset, view.byteOffset + view.byteLength);
    expect(image.mimeType).toBe("image/png");
    expect(isPng(png)).toBe(true);
    expect(json.materials[1].pbrMetallicRoughness.baseColorTexture).toBeUndefined();
  });

  it("writes accessor data that matches the source geometry", () => {
    const prim = json.meshes[0].primitives[0];
    const posAcc = json.accessors[prim.attributes.POSITION];
    expect(posAcc.type).toBe("VEC3");
    expect(posAcc.count).toBe(4);
    expect(posAcc.min).toEqual([0, 0, 0]);
    expect(posAcc.max).toEqual([1, 1, 0]);
    const view = json.bufferViews[posAcc.bufferView];
    expect(parsed.bin.readFloatLE(view.byteOffset + 12)).toBe(1); // vertex 1 x

    const idxAcc = json.accessors[prim.indices];
    expect(idxAcc.componentType).toBe(5125);
    expect(idxAcc.count).toBe(6);
    const idxView = json.bufferViews[idxAcc.bufferView];
    expect(parsed.bin.readUInt32LE(idxView.byteOffset + 4)).toBe(1);

    const colAcc = json.accessors[prim.attributes.COLOR_0];
    expect(colAcc.normalized).toBe(true);
    expect(colAcc.componentType).toBe(5121);
  });

  it("adds a Z-up → Y-up root node by default and can skip it", () => {
    const root = json.nodes[json.scenes[0].nodes[0]];
    expect(root.rotation[0]).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(root.children).toEqual([0]);
    const flat = parseGlb(drawableToGlb(drawable, textures, { zUpToYUp: false })).json as Record<
      string,
      any
    >;
    expect(flat.nodes[flat.scenes[0].nodes[0]].mesh).toBe(0);
  });

  it("can skip texture embedding", () => {
    const bare = parseGlb(drawableToGlb(drawable, textures, { embedTextures: false }))
      .json as Record<string, any>;
    expect(bare.images).toBeUndefined();
  });

  it("throws for a drawable with no geometry", () => {
    expect(() =>
      drawableToGlb({ ...drawable, lods: { high: [], med: [], low: [], vlow: [] } }),
    ).toThrow(RageFormatError);
  });
});

describe("parseGlb", () => {
  it("rejects malformed containers", () => {
    expect(() => parseGlb(Buffer.alloc(4))).toThrow(/only 4 bytes/);
    const bad = Buffer.alloc(24);
    bad.writeUInt32LE(0x12345678, 0);
    expect(() => parseGlb(bad)).toThrow(/missing 'glTF' magic/);
    const wrongLength = Buffer.alloc(24);
    wrongLength.writeUInt32LE(GLB_MAGIC, 0);
    wrongLength.writeUInt32LE(2, 4);
    wrongLength.writeUInt32LE(999, 8);
    expect(() => parseGlb(wrongLength)).toThrow(/declares 999 bytes/);
  });
});
