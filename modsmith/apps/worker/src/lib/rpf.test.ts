import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  DIRECTORY_IDENT,
  ENCRYPTION_AES,
  ENCRYPTION_OPEN,
  extractRpfEntry,
  parseRsc7Header,
  readRpf,
  resourceSizes,
  RPF7_MAGIC,
  RSC7_MAGIC,
  versionFromFlags,
} from "./rpf";

/** Build a synthetic (unencrypted) RPF7 archive with a root directory and files. */
interface TestFile {
  name: string;
  data: Buffer;
  kind: "binary" | "resource";
  compress?: boolean;
  systemFlags?: number;
  graphicsFlags?: number;
}

function buildRpf(files: TestFile[], encryption = ENCRYPTION_OPEN): Buffer {
  const names: string[] = [""];
  const nameOffsets = new Map<string, number>();
  nameOffsets.set("", 0);
  let nameCursor = 1;
  for (const f of files) {
    nameOffsets.set(f.name, nameCursor);
    names.push(f.name);
    nameCursor += Buffer.byteLength(f.name) + 1;
  }
  const nameTable = Buffer.concat(names.map((n) => Buffer.concat([Buffer.from(n, "utf8"), Buffer.from([0])])));
  const entryCount = files.length + 1; // + root directory
  const tocEnd = 16 + entryCount * 16 + nameTable.length;
  const dataStart = Math.ceil(tocEnd / 512) * 512;

  const payloads: { offsetBlocks: number; buf: Buffer }[] = [];
  let cursor = dataStart;
  for (const f of files) {
    const stored = f.compress ? deflateRawSync(f.data) : f.data;
    payloads.push({ offsetBlocks: cursor / 512, buf: stored });
    cursor += Math.ceil(stored.length / 512) * 512;
  }

  const entries = Buffer.alloc(entryCount * 16);
  // Root directory entry: children start at index 1.
  entries.writeUInt32LE(0, 0);
  entries.writeUInt32LE(DIRECTORY_IDENT, 4);
  entries.writeUInt32LE(1, 8);
  entries.writeUInt32LE(files.length, 12);

  files.forEach((f, i) => {
    const off = (i + 1) * 16;
    const nameOffset = nameOffsets.get(f.name)!;
    const payload = payloads[i]!;
    if (f.kind === "binary") {
      const storedSize = f.compress ? payload.buf.length : 0;
      const lo = (nameOffset & 0xffff) | ((storedSize & 0xffff) << 16);
      const hi = ((storedSize >>> 16) & 0xff) | ((payload.offsetBlocks & 0xffffff) << 8);
      entries.writeUInt32LE(lo >>> 0, off);
      entries.writeUInt32LE(hi >>> 0, off + 4);
      entries.writeUInt32LE(f.data.length, off + 8);
      entries.writeUInt32LE(0, off + 12);
    } else {
      entries.writeUInt16LE(nameOffset, off);
      const storedSize = payload.buf.length;
      entries.writeUInt8(storedSize & 0xff, off + 2);
      entries.writeUInt8((storedSize >>> 8) & 0xff, off + 3);
      entries.writeUInt8((storedSize >>> 16) & 0xff, off + 4);
      entries.writeUInt8(payload.offsetBlocks & 0xff, off + 5);
      entries.writeUInt8((payload.offsetBlocks >>> 8) & 0xff, off + 6);
      entries.writeUInt8((payload.offsetBlocks >>> 16) & 0xff, off + 7);
      entries.writeUInt32LE(f.systemFlags ?? 0x90000010, off + 8);
      entries.writeUInt32LE(f.graphicsFlags ?? 0xa0000020, off + 12);
    }
  });

  const header = Buffer.alloc(16);
  header.writeUInt32LE(RPF7_MAGIC, 0);
  header.writeUInt32LE(entryCount, 4);
  header.writeUInt32LE(nameTable.length, 8);
  header.writeUInt32LE(encryption, 12);

  const out = Buffer.alloc(cursor);
  header.copy(out, 0);
  entries.copy(out, 16);
  nameTable.copy(out, 16 + entries.length);
  files.forEach((_, i) => payloads[i]!.buf.copy(out, payloads[i]!.offsetBlocks * 512));
  return out;
}

describe("readRpf", () => {
  it("parses the header and table of contents", () => {
    const archive = readRpf(
      buildRpf([
        { name: "vehicles.meta", data: Buffer.from("<CVehicleModelInfo__InitDataList />"), kind: "binary" },
        { name: "adder.yft", data: Buffer.alloc(2048, 7), kind: "resource" },
      ]),
    );
    expect(archive.header.version).toBe(RPF7_MAGIC);
    expect(archive.header.encryption).toBe(ENCRYPTION_OPEN);
    expect(archive.header.entryCount).toBe(3);
    expect(archive.files.map((f) => f.name)).toEqual(["vehicles.meta", "adder.yft"]);
    expect(archive.files[0]!.type).toBe("binary");
    expect(archive.files[1]!.type).toBe("resource");
  });

  it("extracts an uncompressed binary entry byte-for-byte", () => {
    const data = Buffer.from("fx_version 'cerulean'\n");
    const buf = buildRpf([{ name: "fxmanifest.lua", data, kind: "binary" }]);
    const archive = readRpf(buf);
    expect(extractRpfEntry(buf, archive.files[0]!)).toEqual(data);
  });

  it("inflates a compressed binary entry", () => {
    const data = Buffer.from("handling".repeat(200));
    const buf = buildRpf([{ name: "handling.meta", data, kind: "binary", compress: true }]);
    const archive = readRpf(buf);
    expect(extractRpfEntry(buf, archive.files[0]!)).toEqual(data);
  });

  it("rebuilds an RSC7 header for resource entries", () => {
    const payload = Buffer.alloc(1024, 3);
    const buf = buildRpf([{ name: "prop.ydr", data: payload, kind: "resource", compress: true, systemFlags: 0x90000010, graphicsFlags: 0xa0000020 }]);
    const archive = readRpf(buf);
    const extracted = extractRpfEntry(buf, archive.files[0]!);
    expect(extracted.readUInt32LE(0)).toBe(RSC7_MAGIC);
    expect(extracted.readUInt32LE(4)).toBe(versionFromFlags(0x90000010, 0xa0000020));
    expect(extracted.readUInt32LE(8)).toBe(0x90000010);
    expect(extracted.readUInt32LE(12)).toBe(0xa0000020);
    expect(extracted.subarray(16)).toEqual(payload);
  });

  it("throws RPF_ENCRYPTED for AES archives", () => {
    const buf = buildRpf([{ name: "x.ytd", data: Buffer.alloc(16), kind: "binary" }], ENCRYPTION_AES);
    expect(() => readRpf(buf)).toThrowError(/encrypted/i);
    try {
      readRpf(buf);
    } catch (err) {
      expect((err as { code: string }).code).toBe("RPF_ENCRYPTED");
    }
  });

  it("rejects files that are not RPF7", () => {
    expect(() => readRpf(Buffer.from("not an rpf archive at all"))).toThrowError(/RPF7/);
  });
});

describe("resource page flags", () => {
  it("derives non-zero sizes from page flags", () => {
    const { systemSize, graphicsSize } = resourceSizes(0x90000010, 0xa0000020);
    expect(systemSize).toBeGreaterThan(0);
    expect(graphicsSize).toBeGreaterThan(0);
  });

  it("parses a standalone RSC7 header", () => {
    const head = Buffer.alloc(32);
    head.writeUInt32LE(RSC7_MAGIC, 0);
    head.writeUInt32LE(165, 4);
    head.writeUInt32LE(0x90000010, 8);
    head.writeUInt32LE(0xa0000020, 12);
    const parsed = parseRsc7Header(head)!;
    expect(parsed.version).toBe(165);
    expect(parsed.graphicsSize).toBeGreaterThan(0);
    expect(parseRsc7Header(Buffer.alloc(32))).toBeNull();
  });
});
