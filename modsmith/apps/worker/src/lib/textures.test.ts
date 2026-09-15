import { describe, expect, it } from "vitest";
import { clampPowerOfTwo, detectTextureRole, hasAlpha, mipCount, pickDdsFormat, sanitizeTextureName, vramForTexture } from "./textures";

describe("detectTextureRole", () => {
  it("detects normal maps", () => {
    for (const name of ["body_n.png", "wall_normal.jpg", "x_nrm.dds", "y_NM.png", "z_norm.png"]) {
      expect(detectTextureRole(name)).toBe("normal");
    }
  });

  it("detects spec, rough and metal maps", () => {
    expect(detectTextureRole("body_s.png")).toBe("spec");
    expect(detectTextureRole("body_spec.png")).toBe("spec");
    expect(detectTextureRole("body_r.png")).toBe("rough");
    expect(detectTextureRole("body_roughness.png")).toBe("rough");
    expect(detectTextureRole("body_m.png")).toBe("metal");
    expect(detectTextureRole("body_metallic.png")).toBe("metal");
    expect(detectTextureRole("body_ao.png")).toBe("ao");
  });

  it("defaults to diffuse", () => {
    expect(detectTextureRole("body.png")).toBe("diffuse");
    expect(detectTextureRole("body_d.png")).toBe("diffuse");
    expect(detectTextureRole("body_albedo.png")).toBe("diffuse");
    expect(detectTextureRole("/tmp/some/path/crate_basecolor.jpg")).toBe("diffuse");
  });

  it("ignores directories and extensions", () => {
    expect(detectTextureRole("/a/b_normal/c_s.png")).toBe("spec");
  });
});

describe("sanitizeTextureName", () => {
  it("lowercases and strips unsafe characters", () => {
    expect(sanitizeTextureName("My Texture!.PNG")).toBe("my_texture");
    expect(sanitizeTextureName("/dir/Body-01.dds")).toBe("body_01");
    expect(sanitizeTextureName("---")).toBe("texture");
  });
});

describe("power-of-two helpers", () => {
  it("rounds to the nearest power of two within bounds", () => {
    expect(clampPowerOfTwo(1000)).toBe(1024);
    expect(clampPowerOfTwo(600)).toBe(512);
    expect(clampPowerOfTwo(3)).toBe(4);
    expect(clampPowerOfTwo(9000)).toBe(4096);
  });

  it("counts the full mip chain", () => {
    expect(mipCount(1024, 1024)).toBe(11);
    expect(mipCount(512, 256)).toBe(10);
    expect(mipCount(1, 1)).toBe(1);
  });
});

describe("format selection", () => {
  const image = (alpha: number) => ({ width: 2, height: 2, data: Buffer.from([255, 0, 0, alpha, 0, 255, 0, alpha, 0, 0, 255, alpha, 255, 255, 255, alpha]) });

  it("detects alpha", () => {
    expect(hasAlpha(image(255))).toBe(false);
    expect(hasAlpha(image(128))).toBe(true);
  });

  it("uses DXT1 for opaque diffuse and DXT5 when alpha or normal", () => {
    expect(pickDdsFormat(image(255), "diffuse")).toBe("DXT1");
    expect(pickDdsFormat(image(10), "diffuse")).toBe("DXT5");
    expect(pickDdsFormat(image(255), "normal")).toBe("DXT5");
  });
});

describe("vramForTexture", () => {
  it("accounts for block compression and mips", () => {
    // 1024² DXT1 mip 0 = 512 KiB; the full chain adds ~1/3.
    expect(vramForTexture(1024, 1024, "DXT1", 1)).toBe(524_288);
    expect(vramForTexture(1024, 1024, "DXT5", 1)).toBe(1_048_576);
    expect(vramForTexture(1024, 1024, "A8R8G8B8", 1)).toBe(4_194_304);
    expect(vramForTexture(1024, 1024, "DXT1", 11)).toBeGreaterThan(524_288);
    expect(vramForTexture(1024, 1024, "DXT1", 11)).toBeLessThan(524_288 * 1.4);
  });
});
