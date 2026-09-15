import { describe, expect, it } from "vitest";
import {
  decodeFlags,
  flagsToSize,
  isRsc7,
  parseRsc7,
  RESOURCE_VERSIONS,
  sizeToFlags,
  writeRsc7,
} from "./rsc7.js";
import { RageFormatError } from "./errors.js";

describe("RSC7 flag encoding", () => {
  it("decodes the documented header examples", () => {
    // baseShift 4 → base page 0x2000; one page of 1× base.
    expect(flagsToSize(0x08000004)).toBe(0x2000);
    // baseShift 4 → base page 0x2000; one page of 8× base.
    expect(flagsToSize(0x01000004)).toBe(0x10000);
  });

  it("decodes the page table fields", () => {
    const t = decodeFlags(0x08000004);
    expect(t.baseShift).toBe(4);
    expect(t.baseSize).toBe(0x2000);
    expect(t.counts.at(-1)).toBe(1); // one page of multiplier 1
    expect(t.size).toBe(0x2000);
  });

  it("encodes zero as zero", () => {
    expect(sizeToFlags(0)).toBe(0);
    expect(flagsToSize(0)).toBe(0);
  });

  it("round-trips a wide range of sizes with no loss and minimal padding", () => {
    for (const size of [1, 16, 0x1000, 0x2000, 0x2001, 0x12345, 0x100000, 0x987654, 0x4000000]) {
      const flags = sizeToFlags(size);
      const got = flagsToSize(flags);
      expect(got).toBeGreaterThanOrEqual(size);
      // Never pad by more than one base page.
      expect(got - size).toBeLessThan(decodeFlags(flags).baseSize);
    }
  });

  it("honours a minimum base page size", () => {
    const flags = sizeToFlags(0x3000, { minBaseSize: 0x40000 });
    expect(decodeFlags(flags).baseSize).toBeGreaterThanOrEqual(0x40000);
  });

  it("rejects sizes that cannot be encoded", () => {
    expect(() => sizeToFlags(Number.MAX_SAFE_INTEGER)).toThrow(RageFormatError);
  });
});

describe("RSC7 container", () => {
  it("round-trips system and graphics segments", () => {
    const system = Buffer.alloc(0x1234);
    for (let i = 0; i < system.length; i++) system[i] = i & 0xff;
    const graphics = Buffer.alloc(0x800, 0xab);

    const file = writeRsc7({ version: RESOURCE_VERSIONS.ytd, system, graphics });
    expect(isRsc7(file)).toBe(true);
    expect(file.subarray(0, 4).toString("latin1")).toBe("RSC7");

    const parsed = parseRsc7(file);
    expect(parsed.isRsc7).toBe(true);
    expect(parsed.version).toBe(RESOURCE_VERSIONS.ytd);
    expect(parsed.systemSize).toBeGreaterThanOrEqual(system.length);
    expect(parsed.graphicsSize).toBeGreaterThanOrEqual(graphics.length);
    expect(parsed.systemData.subarray(0, system.length).equals(system)).toBe(true);
    expect(parsed.graphicsData.subarray(0, graphics.length).equals(graphics)).toBe(true);
    // Padding is zero-filled.
    expect(parsed.systemData.subarray(system.length).every((b) => b === 0)).toBe(true);
  });

  it("reproduces the same sizes when rewritten", () => {
    const original = writeRsc7({
      version: RESOURCE_VERSIONS.ydr,
      system: Buffer.alloc(0x5000, 1),
      graphics: Buffer.alloc(0x20000, 2),
    });
    const a = parseRsc7(original);
    const rewritten = writeRsc7({
      version: a.version,
      system: a.systemData,
      graphics: a.graphicsData,
    });
    const b = parseRsc7(rewritten);
    expect(b.systemSize).toBe(a.systemSize);
    expect(b.graphicsSize).toBe(a.graphicsSize);
    expect(b.systemFlags).toBe(a.systemFlags);
    expect(b.graphicsFlags).toBe(a.graphicsFlags);
    expect(b.payload.equals(a.payload)).toBe(true);
  });

  it("handles a graphics-free resource", () => {
    const file = writeRsc7({ version: RESOURCE_VERSIONS.ybn, system: Buffer.alloc(64, 7) });
    const parsed = parseRsc7(file);
    expect(parsed.graphicsSize).toBe(0);
    expect(parsed.graphicsData.length).toBe(0);
  });

  it("throws a typed error on a short buffer", () => {
    expect(() => parseRsc7(Buffer.alloc(8))).toThrow(RageFormatError);
    try {
      parseRsc7(Buffer.alloc(8));
    } catch (e) {
      expect((e as RageFormatError).code).toBe("TRUNCATED");
    }
  });

  it("throws a typed error on bad magic", () => {
    const bad = Buffer.alloc(32);
    bad.write("NOPE", 0, "latin1");
    try {
      parseRsc7(bad);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RageFormatError);
      expect((e as RageFormatError).code).toBe("BAD_MAGIC");
    }
  });

  it("throws when the payload is not deflate", () => {
    const file = writeRsc7({ version: 1, system: Buffer.alloc(16) });
    file.fill(0xff, 16);
    try {
      parseRsc7(file);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as RageFormatError).code).toBe("BAD_PAYLOAD");
    }
  });

  it("throws when the payload is shorter than the declared segments", () => {
    const file = writeRsc7({ version: 1, system: Buffer.alloc(16) });
    // Claim a much larger graphics segment than the payload holds.
    file.writeUInt32LE(0x01000004, 12);
    try {
      parseRsc7(file);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as RageFormatError).code).toBe("TRUNCATED_PAYLOAD");
    }
  });
});
