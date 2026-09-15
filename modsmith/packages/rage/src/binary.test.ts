import { describe, expect, it } from "vitest";
import {
  decodePointer,
  GRAPHICS_BASE,
  makePointer,
  ResourceBuilder,
  ResourceReader,
  SYSTEM_BASE,
} from "./binary.js";
import { RageFormatError } from "./errors.js";

describe("resource pointers", () => {
  it("tags segments in the top nibble", () => {
    expect(makePointer("system", 0x1234)).toBe(SYSTEM_BASE | 0x1234);
    expect(makePointer("graphics", 0x1234)).toBe(GRAPHICS_BASE | 0x1234);
  });

  it("decodes back to segment and offset", () => {
    expect(decodePointer(0x50001234)).toEqual({ segment: "system", offset: 0x1234 });
    expect(decodePointer(0x60000010)).toEqual({ segment: "graphics", offset: 0x10 });
    expect(decodePointer(0)).toBeNull();
  });

  it("rejects unknown segment tags", () => {
    expect(() => decodePointer(0x70000000)).toThrow(RageFormatError);
  });

  it("rejects offsets that do not fit", () => {
    expect(() => makePointer("system", 0x10000000)).toThrow(RageFormatError);
  });
});

describe("ResourceReader", () => {
  const system = Buffer.alloc(64);
  system.writeUInt32LE(0xdeadbeef, 0);
  system.writeFloatLE(1.5, 4);
  system.write("hello\0", 8, "latin1");
  system.writeUInt32LE(makePointer("system", 8), 16);
  const reader = new ResourceReader(system, Buffer.alloc(8, 0x11));

  it("reads scalars", () => {
    expect(reader.u32("system", 0)).toBe(0xdeadbeef);
    expect(reader.f32("system", 4)).toBe(1.5);
    expect(reader.u8("graphics", 0)).toBe(0x11);
  });

  it("reads NUL-terminated strings through pointers", () => {
    expect(reader.stringAt(reader.pointer("system", 16))).toBe("hello");
    expect(reader.stringAt(null)).toBeNull();
  });

  it("bounds-checks every read", () => {
    expect(() => reader.u32("system", 62)).toThrow(RageFormatError);
    expect(() => reader.bytes("graphics", 0, 100)).toThrow(RageFormatError);
    try {
      reader.u32("system", 1000);
    } catch (e) {
      expect((e as RageFormatError).code).toBe("OUT_OF_BOUNDS");
    }
  });
});

describe("ResourceBuilder", () => {
  it("lays blocks out with alignment and resolves pointers", () => {
    const b = new ResourceBuilder();
    const root = b.system({ size: 16, align: 16, label: "root" });
    const child = b.system({ align: 16, label: "child" });
    const data = b.graphics({ align: 16, label: "data" });

    child.u32(0xcafe).u32(0xbabe);
    data.bytes(Buffer.alloc(40, 0x5a));
    root.pointer(child).pointer(data).pointer(null).u32(7);

    const built = b.build();
    expect(built.system.length % 16).toBe(0);
    expect(built.graphics.length).toBeGreaterThanOrEqual(40);

    const r = new ResourceReader(built.system, built.graphics);
    const childPtr = r.pointer("system", 0);
    expect(childPtr?.segment).toBe("system");
    expect(r.u32("system", childPtr!.offset)).toBe(0xcafe);

    const dataPtr = r.pointer("system", 4);
    expect(dataPtr?.segment).toBe("graphics");
    expect(r.u8("graphics", dataPtr!.offset)).toBe(0x5a);

    expect(r.pointer("system", 8)).toBeNull();
    expect(r.u32("system", 12)).toBe(7);
    // Root block must start at offset 0 so it is the resource root.
    expect(root.offset).toBe(0);
    // Child is 16-byte aligned.
    expect(child.offset % 16).toBe(0);
  });

  it("deduplicates identical strings", () => {
    const b = new ResourceBuilder();
    b.system({ size: 16 });
    const a1 = b.string("shared");
    const a2 = b.string("shared");
    const a3 = b.string("other");
    expect(a1).toBe(a2);
    expect(a3).not.toBe(a1);
    b.build();
    expect(a1.offset).toBe(a2.offset);
  });

  it("throws when a fixed block overflows", () => {
    const b = new ResourceBuilder();
    const block = b.system({ size: 8 });
    block.u32(1).u32(2);
    expect(() => block.u32(3)).toThrow(RageFormatError);
  });

  it("throws when a pointer targets a block the builder never saw", () => {
    const b = new ResourceBuilder();
    const root = b.system({ size: 8 });
    const orphan = new ResourceBuilder().system({ size: 4 });
    root.pointer(orphan);
    expect(() => b.build()).toThrow(RageFormatError);
  });

  it("grows growable blocks", () => {
    const b = new ResourceBuilder();
    const block = b.system({ label: "big" });
    for (let i = 0; i < 1000; i++) block.u32(i);
    const built = b.build();
    const r = new ResourceReader(built.system);
    expect(r.u32("system", block.offset + 999 * 4)).toBe(999);
  });
});
