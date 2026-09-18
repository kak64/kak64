import { describe, expect, it } from "vitest";
import { d3dFromFormat, formatFromD3d, readYtd, readYtdDictionary, writeYtd } from "./ytd.js";
import { decodeDds, encodeDds, mipChainSize, surfaceSize } from "./dds.js";
import { parseRsc7, RESOURCE_VERSIONS } from "./rsc7.js";
import { joaat } from "./hash.js";
import { RageFormatError } from "./errors.js";

function checker(w: number, h: number, seed = 0): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const on = ((x >> 2) + (y >> 2) + seed) % 2 === 0;
      out[i] = on ? 220 : 30;
      out[i + 1] = (x * 4 + seed * 17) & 0xff;
      out[i + 2] = (y * 4) & 0xff;
      out[i + 3] = 255;
    }
  }
  return out;
}

describe("texture format codes", () => {
  it("maps D3DFORMAT codes both ways", () => {
    for (const f of ["DXT1", "DXT3", "DXT5", "A8R8G8B8", "A8", "L8", "BC7", "BC4", "BC5"] as const) {
      expect(formatFromD3d(d3dFromFormat(f))).toBe(f);
    }
    expect(d3dFromFormat("DXT1")).toBe(0x31545844);
    expect(d3dFromFormat("BC7")).toBe(0x20374342);
  });

  it("surfaces unknown codes as hex and accepts them back", () => {
    const name = formatFromD3d(0x12345678);
    expect(name).toBe("0x12345678");
    expect(d3dFromFormat(name)).toBe(0x12345678);
  });

  it("throws for a format with no code", () => {
    expect(() => d3dFromFormat("something-else")).toThrow(RageFormatError);
  });
});

describe("writeYtd → readYtd round trip", () => {
  const inputs = [
    { name: "vehicle_body", dds: encodeDds(checker(64, 64, 0), 64, 64, { format: "DXT5", mips: true }) },
    { name: "vehicle_body_n", dds: encodeDds(checker(32, 32, 1), 32, 32, { format: "DXT1", mips: true }) },
    { name: "sign_plate", dds: encodeDds(checker(16, 8, 2), 16, 8, { format: "A8R8G8B8" }) },
  ];

  it("produces a valid RSC7 .ytd", () => {
    const file = writeYtd(inputs);
    const res = parseRsc7(file);
    expect(res.version).toBe(RESOURCE_VERSIONS.ytd);
    expect(res.systemSize).toBeGreaterThan(0);
    expect(res.graphicsSize).toBeGreaterThan(0);
  });

  it("preserves names, dimensions, format and mip counts", () => {
    const textures = readYtd(writeYtd(inputs));
    expect(textures).toHaveLength(3);
    const byName = new Map(textures.map((t) => [t.name, t]));

    const body = byName.get("vehicle_body")!;
    expect(body.width).toBe(64);
    expect(body.height).toBe(64);
    expect(body.format).toBe("DXT5");
    expect(body.mipLevels).toBe(7);
    expect(body.depth).toBe(1);
    expect(body.stride).toBe(256); // 16 blocks × 16 bytes
    expect(body.dataSize).toBe(mipChainSize("DXT5", 64, 64, 7));

    const normal = byName.get("vehicle_body_n")!;
    expect(normal.format).toBe("DXT1");
    expect(normal.mipLevels).toBe(6);

    const plate = byName.get("sign_plate")!;
    expect(plate.format).toBe("A8R8G8B8");
    expect(plate.width).toBe(16);
    expect(plate.height).toBe(8);
    expect(plate.mipLevels).toBe(1);
    expect(plate.stride).toBe(64);
  });

  it("preserves every mip's bytes exactly", () => {
    const textures = readYtd(writeYtd(inputs));
    for (const input of inputs) {
      const src = decodeDds(input.dds);
      const tex = textures.find((t) => t.name === input.name)!;
      expect(tex.mipLevels).toBe(src.mips);
      for (let level = 0; level < src.mips; level++) {
        expect(tex.levelData(level).equals(src.levelData(level))).toBe(true);
      }
    }
  });

  it("sorts entries by ascending name hash, as the dictionary requires", () => {
    const textures = readYtd(writeYtd(inputs));
    const hashes = textures.map((t) => t.nameHash);
    expect(hashes).toEqual([...hashes].sort((a, b) => a - b));
    for (const t of textures) expect(t.nameHash).toBe(joaat(t.name));
  });

  it("re-exports a DDS that decodes to the original", () => {
    const textures = readYtd(writeYtd(inputs));
    const body = textures.find((t) => t.name === "vehicle_body")!;
    const dds = decodeDds(body.dds());
    expect(dds.width).toBe(64);
    expect(dds.height).toBe(64);
    expect(dds.format).toBe("DXT5");
    expect(dds.mips).toBe(7);
    expect(dds.levelData(0).equals(decodeDds(inputs[0]!.dds).levelData(0))).toBe(true);
  });

  it("decodes textures to RGBA", () => {
    const textures = readYtd(writeYtd(inputs));
    const plate = textures.find((t) => t.name === "sign_plate")!;
    const rgba = plate.rgba(0)!;
    expect(rgba.width).toBe(16);
    expect(rgba.height).toBe(8);
    expect(Buffer.from(rgba.data).equals(Buffer.from(checker(16, 8, 2)))).toBe(true);

    const body = textures.find((t) => t.name === "vehicle_body")!;
    expect(body.rgba(1)!.width).toBe(32);
  });

  it("survives a second write/read cycle unchanged", () => {
    const first = readYtd(writeYtd(inputs));
    const second = readYtd(writeYtd(first.map((t) => ({ name: t.name, dds: t.dds() }))));
    expect(second.map((t) => t.name)).toEqual(first.map((t) => t.name));
    for (let i = 0; i < first.length; i++) {
      expect(second[i]!.width).toBe(first[i]!.width);
      expect(second[i]!.format).toBe(first[i]!.format);
      expect(second[i]!.mipLevels).toBe(first[i]!.mipLevels);
      expect(second[i]!.levelData(0).equals(first[i]!.levelData(0))).toBe(true);
    }
  });

  it("handles an empty dictionary", () => {
    expect(readYtd(writeYtd([]))).toEqual([]);
  });

  it("handles a large-ish texture spanning several pages", () => {
    const dds = encodeDds(checker(256, 256), 256, 256, { format: "DXT5", mips: true });
    const textures = readYtd(writeYtd([{ name: "big", dds }]));
    expect(textures[0]!.dataSize).toBe(mipChainSize("DXT5", 256, 256, 9));
    expect(textures[0]!.levelData(8).length).toBe(surfaceSize("DXT5", 1, 1));
  });

  it("preserves an explicit VFT", () => {
    const file = writeYtd([{ name: "t", dds: inputs[1]!.dds, vft: 0x12345678 }], {
      dictionaryVft: 0x0abcdef0,
    });
    const dict = readYtdDictionary(file);
    expect(dict.vft).toBe(0x0abcdef0);
    expect(dict.textures[0]!.vft).toBe(0x12345678);
  });

  it("rejects colliding name hashes", () => {
    expect(() =>
      writeYtd([
        { name: "Same", dds: inputs[1]!.dds },
        { name: "same", dds: inputs[1]!.dds },
      ]),
    ).toThrow(/collide on name hash/);
  });

  it("rejects a non-RSC7 buffer", () => {
    expect(() => readYtd(Buffer.alloc(64))).toThrow(RageFormatError);
  });
});
