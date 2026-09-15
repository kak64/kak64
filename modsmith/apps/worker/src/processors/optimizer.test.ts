import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RSC7_MAGIC } from "../lib/rpf";
import { analyzeDirectory, manifestReferences } from "./optimizer";

let dir: string;

/** An RSC7 container header with large graphics pages but no readable body. */
function fakeRsc7(systemFlags: number, graphicsFlags: number, bodyBytes = 4096): Buffer {
  const head = Buffer.alloc(16 + bodyBytes);
  head.writeUInt32LE(RSC7_MAGIC, 0);
  head.writeUInt32LE(165, 4);
  head.writeUInt32LE(systemFlags, 8);
  head.writeUInt32LE(graphicsFlags, 12);
  return head;
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "modsmith-opt-"));
  await mkdir(path.join(dir, "stream"), { recursive: true });
  await writeFile(
    path.join(dir, "fxmanifest.lua"),
    ["fx_version 'cerulean'", "game 'gta5'", "files {", "    'data/handling.meta',", "}", "data_file 'HANDLING_FILE' 'data/handling.meta'"].join("\n"),
  );
  await mkdir(path.join(dir, "data"), { recursive: true });
  await writeFile(path.join(dir, "data/handling.meta"), "<CHandlingDataMgr />");
  // A loose 1024² PNG: 4 MiB of RGBA the game can never stream.
  await writeFile(path.join(dir, "logo.png"), await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } }).png().toBuffer());
  await writeFile(path.join(dir, "stream/vehicle.ytd"), fakeRsc7(0x90000010, 0xd0000040));
  await writeFile(path.join(dir, "stream/vehicle.yft"), fakeRsc7(0x90000010, 0xa0000020));
  await writeFile(path.join(dir, "notes.txt"), "hello");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("analyzeDirectory", () => {
  it("accounts for every file and estimates VRAM from RSC7 page flags", async () => {
    const report = await analyzeDirectory(dir, { maxTextureSize: 2048, kind: "vehicle" });
    expect(report.files.map((f) => f.path).sort()).toEqual(["data/handling.meta", "fxmanifest.lua", "logo.png", "notes.txt", "stream/vehicle.yft", "stream/vehicle.ytd"].sort());
    expect(report.totalBytes).toBeGreaterThan(0);
    const ytd = report.files.find((f) => f.path === "stream/vehicle.ytd")!;
    expect(ytd.type).toBe("ytd");
    expect(ytd.vramBytes).toBeGreaterThan(0);
    expect(report.estimatedVramBytes).toBeGreaterThanOrEqual(ytd.vramBytes);
  });

  it("flags a loose image as RAW_IMAGE with a saving estimate", async () => {
    const report = await analyzeDirectory(dir, { maxTextureSize: 2048, kind: "vehicle" });
    const issue = report.issues.find((i) => i.code === "RAW_IMAGE")!;
    expect(issue).toBeDefined();
    expect(issue.path).toBe("logo.png");
    expect(issue.savingsBytes).toBeGreaterThan(0);
    expect(issue.recommendation).toMatch(/ytd/i);
    const png = report.files.find((f) => f.path === "logo.png")!;
    expect(png.vramBytes).toBe(1024 * 1024 * 4);
  });

  it("flags files that are neither streamed nor referenced by the manifest", async () => {
    const report = await analyzeDirectory(dir, { maxTextureSize: 2048, kind: "vehicle" });
    const unused = report.issues.filter((i) => i.code === "UNUSED_ASSET").map((i) => i.path);
    expect(unused).toContain("logo.png");
    // Declared in fxmanifest and inside stream/ respectively — neither is "unused".
    expect(unused).not.toContain("data/handling.meta");
    expect(unused).not.toContain("stream/vehicle.ytd");
  });

  it("raises EXCESSIVE_VRAM against the vehicle budget but not the map budget", async () => {
    const heavy = await mkdtemp(path.join(os.tmpdir(), "modsmith-opt-heavy-"));
    try {
      // Five 2048² RGBA images = 80 MB: over the 64 MB vehicle budget, under the 128 MB map budget.
      const image = await sharp({ create: { width: 2048, height: 2048, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).png().toBuffer();
      for (let i = 0; i < 5; i++) await writeFile(path.join(heavy, `tex${i}.png`), image);
      const vehicle = await analyzeDirectory(heavy, { maxTextureSize: 2048, kind: "vehicle" });
      const map = await analyzeDirectory(heavy, { maxTextureSize: 2048, kind: "map" });
      expect(vehicle.estimatedVramBytes).toBe(5 * 2048 * 2048 * 4);
      const vehicleIssue = vehicle.issues.find((i) => i.code === "EXCESSIVE_VRAM")!;
      expect(vehicleIssue).toBeDefined();
      expect(vehicleIssue.savingsBytes).toBe(vehicle.estimatedVramBytes - 64 * 1024 * 1024);
      expect(map.issues.some((i) => i.code === "EXCESSIVE_VRAM")).toBe(false);
      expect(vehicle.issues.every((i) => ["critical", "high", "medium", "low"].includes(i.severity))).toBe(true);
    } finally {
      await rm(heavy, { recursive: true, force: true });
    }
  }, 30_000);

  it("sorts issues by severity", async () => {
    const report = await analyzeDirectory(dir, { maxTextureSize: 2048, kind: "vehicle" });
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    const ranks = report.issues.map((i) => rank[i.severity]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });
});

describe("manifestReferences", () => {
  it("collects quoted file paths and their basenames", () => {
    const refs = manifestReferences("files { 'data/handling.meta', \"stream/x.ytd\" }\ndata_file 'HANDLING_FILE' 'data/handling.meta'");
    expect(refs.has("data/handling.meta")).toBe(true);
    expect(refs.has("handling.meta")).toBe(true);
    expect(refs.has("stream/x.ytd")).toBe(true);
    expect(refs.has("HANDLING_FILE")).toBe(false);
  });
});
