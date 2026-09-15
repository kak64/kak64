import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadModel } from "../lib/gltf";
import { computeBounds, triangleCount } from "../lib/mesh";
import { MockProvider } from "./provider";

let dir: string;
let imagePath: string;

/** A red disc on a transparent background: a clear silhouette for the relief builder. */
async function makeDisc(size = 256): Promise<Buffer> {
  const data = Buffer.alloc(size * size * 4);
  const r = size * 0.35;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const d = Math.hypot(x - size / 2, y - size / 2);
      if (d <= r) {
        data[o] = 220;
        data[o + 1] = 60;
        data[o + 2] = 40;
        data[o + 3] = 255;
      }
    }
  }
  return sharp(data, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "modsmith-ai-"));
  imagePath = path.join(dir, "disc.png");
  await writeFile(imagePath, await makeDisc());
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("MockProvider", () => {
  it("produces a GLB that parses back into real geometry", async () => {
    const provider = new MockProvider();
    const result = await provider.generate(imagePath, { workDir: dir, quality: "draft" });
    expect(result.provider).toBe("mock");
    expect(result.glbPath.endsWith(".glb")).toBe(true);

    const loaded = await loadModel(result.glbPath);
    expect(loaded.format).toBe("glb");
    expect(triangleCount(loaded.meshes)).toBeGreaterThan(100);
    expect(loaded.materials.length).toBeGreaterThan(0);
    // The mesh has thickness: a front shell, a back shell and a stitched rim.
    const bounds = computeBounds(loaded.meshes);
    expect(bounds.size[0]).toBeGreaterThan(0);
    expect(bounds.size[1]).toBeGreaterThan(0);
    expect(bounds.size[2]).toBeGreaterThan(0);
    // UVs survive so the source image maps onto the mesh.
    expect(loaded.meshes.some((m) => m.uvs && m.uvs.length > 0)).toBe(true);
  }, 30_000);

  it("follows the silhouette rather than emitting a plain box", async () => {
    const provider = new MockProvider();
    const result = await provider.generate(imagePath, { workDir: dir, quality: "draft" });
    const loaded = await loadModel(result.glbPath);
    const bounds = computeBounds(loaded.meshes);
    // A disc occupies less than the full square: corners are cut away.
    expect(bounds.size[0]).toBeLessThan(0.8);
    expect(triangleCount(loaded.meshes)).toBeGreaterThan(12); // a box would be 12
  }, 30_000);

  it("reports progress and writes a preview image", async () => {
    const provider = new MockProvider();
    const seen: number[] = [];
    const result = await provider.generate(imagePath, { workDir: dir, quality: "draft", onProgress: (f) => seen.push(f) });
    expect(seen.length).toBeGreaterThan(0);
    expect(result.previewPngPath).toBeDefined();
  }, 30_000);

  it("fails with a clear code when the image has no subject", async () => {
    const blank = path.join(dir, "blank.png");
    await writeFile(blank, await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
    const provider = new MockProvider();
    await expect(provider.generate(blank, { workDir: dir, quality: "draft" })).rejects.toMatchObject({ code: "AI_NO_SUBJECT" });
  }, 30_000);
});
