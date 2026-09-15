import { describe, expect, it } from "vitest";
import * as rage from "./index.js";

describe("package entry point", () => {
  it("exports the contract API surface", () => {
    for (const name of [
      "parseRsc7", "writeRsc7", "readYtd", "writeYtd", "readYdr", "writeYdr",
      "readYft", "readYdd", "writeYdd", "readYbn", "writeYbn",
      "ydrXml", "ytdXml", "ytypXml", "ybnXml", "drawableToGlb",
      "encodeDds", "decodeDds", "encodePng", "joaat", "encoderFor",
    ]) {
      expect(typeof (rage as any)[name], name).toBe("function");
    }
    expect(rage.CAPABILITIES.ytd).toBe("native");
    expect(rage.CAPABILITIES.ydr).toBe("xml-only");
    expect(rage.encoderFor("ytd")).toBe("native");
    expect(rage.encoderFor("ydr")).toBe("codewalker-xml");
  });

  it("runs the worker's happy path: dds → ytd → textures → glb", () => {
    const rgba = new Uint8Array(32 * 32 * 4).fill(160);
    const dds = rage.encodeDds(rgba, 32, 32, { format: "DXT5", mips: true });
    const ytd = rage.writeYtd([{ name: "body_d", dds }]);
    const textures = rage.readYtd(ytd);
    expect(textures[0]!.name).toBe("body_d");

    const ydr = rage.writeYdr({
      name: "prop_smoke",
      shaders: [{ name: "default", textures: { DiffuseSampler: "body_d" } }],
      lods: [{ distance: 100, meshes: [{ positions: [0,0,0, 1,0,0, 1,1,0], indices: [0,1,2], shaderIndex: 0 }] }],
    });
    const drawable = rage.readYdr(ydr);
    const glb = rage.drawableToGlb(drawable, textures);
    expect(rage.parseGlb(glb).version).toBe(2);
    expect(rage.ydrXml(drawable)).toContain("<Drawable>");
    expect(rage.ytdXml(textures)).toContain("body_d.dds");
    expect(
      rage.ytypXml({
        name: "prop_smoke",
        archetypes: [{
          name: "prop_smoke", txdName: "prop_smoke", lodDist: 100,
          bbMin: drawable.bounds.min, bbMax: drawable.bounds.max,
          bsCenter: drawable.bounds.center, bsRadius: drawable.bounds.radius,
        }],
      }),
    ).toContain("CBaseArchetypeDef");
  });
});
