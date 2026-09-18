import { describe, expect, it } from "vitest";
import { serializeMetadata, readImageDimensions, sniffImageMime } from "./hub";

describe("hub helpers", () => {
  it("serializes nested metadata for search", () => {
    expect(serializeMetadata({ item: "lockpick", count: 2, nested: { a: true } })).toBe("item=lockpick count=2 nested.a=true");
  });
  it("reads png dimensions", () => {
    const b = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(640, 16); b.writeUInt32BE(480, 20);
    expect(sniffImageMime(b)).toBe("image/png");
    expect(readImageDimensions(b, "image/png")).toEqual({ width: 640, height: 480 });
  });
});
