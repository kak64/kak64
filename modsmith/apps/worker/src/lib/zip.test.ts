import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProcessingError } from "./errors";
import { createZip, extractZip, listZip, sanitizeEntryPath } from "./zip";

/** Minimal ZIP writer so tests can build hostile archives archiver would refuse to make. */
interface RawEntry {
  name: string;
  data: Buffer;
  /** External attributes high word (unix mode). */
  unixMode?: number;
  deflate?: boolean;
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function buildZip(entries: RawEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const stored = entry.deflate ? deflateRawSync(entry.data, { level: 9 }) : entry.data;
    const method = entry.deflate ? 8 : 0;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(entry.data), 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, stored);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.unixMode ? 0x0300 : 20, 4); // version made by: unix when we set a mode
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(entry.data), 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((entry.unixMode ?? 0) * 0x10000, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + stored.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "modsmith-zip-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("sanitizeEntryPath", () => {
  it("accepts ordinary relative paths", () => {
    expect(sanitizeEntryPath("stream/foo.ydr")).toBe("stream/foo.ydr");
    expect(sanitizeEntryPath("a\\b\\c.txt")).toBe("a/b/c.txt");
    expect(sanitizeEntryPath("./x/./y.txt")).toBe("x/y.txt");
  });

  it("rejects traversal, absolute and drive paths", () => {
    expect(sanitizeEntryPath("../secret")).toBeNull();
    expect(sanitizeEntryPath("stream/../../etc/passwd")).toBeNull();
    expect(sanitizeEntryPath("/etc/passwd")).toBeNull();
    expect(sanitizeEntryPath("C:\\windows\\system32")).toBeNull();
    expect(sanitizeEntryPath("")).toBeNull();
  });
});

describe("listZip", () => {
  it("lists a normal archive", async () => {
    const file = path.join(dir, "ok.zip");
    await writeFile(file, buildZip([{ name: "stream/model.ydr", data: Buffer.from("hello") }, { name: "fxmanifest.lua", data: Buffer.from("fx_version 'cerulean'") }]));
    const listing = await listZip(file);
    expect(listing.entries.map((e) => e.path)).toEqual(["stream/model.ydr", "fxmanifest.lua"]);
    expect(listing.totalExpanded).toBe(26);
  });

  it("rejects path traversal", async () => {
    const file = path.join(dir, "traversal.zip");
    await writeFile(file, buildZip([{ name: "../../evil.lua", data: Buffer.from("x") }]));
    await expect(listZip(file)).rejects.toMatchObject({ code: "MALICIOUS_ARCHIVE" });
  });

  it("rejects symlinks", async () => {
    const file = path.join(dir, "symlink.zip");
    await writeFile(file, buildZip([{ name: "link", data: Buffer.from("/etc/passwd"), unixMode: 0xa1ff }]));
    await expect(listZip(file)).rejects.toMatchObject({ code: "MALICIOUS_ARCHIVE" });
  });

  it("rejects executables", async () => {
    const file = path.join(dir, "exe.zip");
    await writeFile(file, buildZip([{ name: "installer.exe", data: Buffer.from("MZ") }]));
    await expect(listZip(file)).rejects.toMatchObject({ code: "MALICIOUS_ARCHIVE" });
  });

  it("rejects a zip bomb by compression ratio", async () => {
    const file = path.join(dir, "bomb.zip");
    // 8 MiB of zeros compresses to a few KiB — a ratio far above the 200:1 limit.
    await writeFile(file, buildZip([{ name: "bomb.bin", data: Buffer.alloc(8 * 1024 * 1024), deflate: true }]));
    await expect(listZip(file)).rejects.toMatchObject({ code: "MALICIOUS_ARCHIVE" });
  });
});

describe("extractZip", () => {
  it("extracts files and keeps content intact", async () => {
    const file = path.join(dir, "extract.zip");
    await writeFile(file, buildZip([{ name: "a/b.txt", data: Buffer.from("content"), deflate: true }]));
    const dest = path.join(dir, "out");
    const entries = await extractZip(file, dest);
    expect(entries).toEqual(["a/b.txt"]);
    expect(await readFile(path.join(dest, "a/b.txt"), "utf8")).toBe("content");
  });

  it("refuses to write outside the destination", async () => {
    const file = path.join(dir, "escape.zip");
    await writeFile(file, buildZip([{ name: "../escape.txt", data: Buffer.from("x") }]));
    await expect(extractZip(file, path.join(dir, "out2"))).rejects.toBeInstanceOf(ProcessingError);
  });
});

describe("createZip", () => {
  it("round-trips files written from memory", async () => {
    const out = path.join(dir, "made.zip");
    const { entries } = await createZip(out, [
      { name: "res/fxmanifest.lua", content: "fx_version 'cerulean'\n" },
      { name: "res/stream/a.ydr", content: Buffer.from([1, 2, 3]) },
    ]);
    expect(entries).toBe(2);
    const listing = await listZip(out);
    expect(listing.entries.map((e) => e.path).sort()).toEqual(["res/fxmanifest.lua", "res/stream/a.ydr"]);
  });
});
