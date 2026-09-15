import { describe, expect, it } from "vitest";
import {
  joaat,
  paramNameFromHash,
  SHADER_HASHES,
  shaderNameFromHash,
  SHADER_PARAM_HASHES,
} from "./hash.js";

describe("joaat", () => {
  it("matches the published test vectors", () => {
    expect(joaat("")).toBe(0);
    expect(joaat("a")).toBe(0xca2e9442);
    expect(joaat("The quick brown fox jumps over the lazy dog", true)).toBe(0x519e91f5);
  });

  it("lowercases by default", () => {
    expect(joaat("DiffuseSampler")).toBe(joaat("diffusesampler"));
    expect(joaat("DiffuseSampler", true)).not.toBe(joaat("diffusesampler", true));
  });

  it("always returns an unsigned 32-bit value", () => {
    for (const s of ["prop_barrel_01a", "vehicle_paint1", "ペイント", "x".repeat(200)]) {
      const h = joaat(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
});

describe("name tables", () => {
  it("resolves known shader hashes", () => {
    expect(shaderNameFromHash(joaat("vehicle_paint1"))).toBe("vehicle_paint1");
    expect(shaderNameFromHash(joaat("normal_spec"))).toBe("normal_spec");
    expect(shaderNameFromHash(joaat("ped_default"))).toBe("ped_default");
  });

  it("resolves known parameter hashes with original casing", () => {
    expect(paramNameFromHash(joaat("DiffuseSampler"))).toBe("DiffuseSampler");
    expect(paramNameFromHash(joaat("BumpSampler"))).toBe("BumpSampler");
    expect(paramNameFromHash(joaat("bumpiness"))).toBe("bumpiness");
  });

  it("falls back to a hex name for unknown hashes", () => {
    expect(shaderNameFromHash(0xdeadbeef)).toBe("hash_deadbeef");
    expect(paramNameFromHash(0x00000001)).toBe("hash_00000001");
  });

  it("has no hash collisions inside each table", () => {
    expect(SHADER_HASHES.size).toBeGreaterThan(100);
    expect(SHADER_PARAM_HASHES.size).toBeGreaterThan(50);
  });
});
