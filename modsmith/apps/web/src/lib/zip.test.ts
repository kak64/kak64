import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { buildZip } from "./zip";

describe("buildZip", () => {
  it("writes a valid zip with central directory", () => {
    const zip = buildZip([{ name: "a/b.txt", data: "hello" }, { name: "c.bin", data: Buffer.from([1, 2, 3]) }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const eocd = zip.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(zip.readUInt16LE(eocd + 10)).toBe(2);
    const nameLen = zip.readUInt16LE(26);
    const compSize = zip.readUInt32LE(18);
    const data = zip.subarray(30 + nameLen, 30 + nameLen + compSize);
    expect(inflateRawSync(data).toString()).toBe("hello");
  });
});
