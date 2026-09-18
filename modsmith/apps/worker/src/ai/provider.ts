import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { workerEnv } from "../lib/env";
import { ProcessingError } from "../lib/errors";
import { buildGlb } from "../lib/gltf";
import { log } from "../lib/log";
import { computeNormals, type MaterialData, type MeshData } from "../lib/mesh";

export interface GenerateOptions {
  /** Directory the provider may write into. */
  workDir: string;
  prompt?: string;
  quality: "draft" | "standard" | "high";
  /** Called with 0..1 progress while polling a remote provider. */
  onProgress?: (fraction: number, message?: string) => void;
  signal?: AbortSignal;
}

export interface GenerateResult {
  glbPath: string;
  previewPngPath?: string;
  provider: string;
  /** Provider job id, when the provider has one. */
  externalId?: string;
}

export interface ImageTo3DProvider {
  readonly name: string;
  generate(imagePath: string, opts: GenerateOptions): Promise<GenerateResult>;
}

const QUALITY_GRID: Record<GenerateOptions["quality"], number> = { draft: 48, standard: 96, high: 160 };

/**
 * Local provider: builds a real relief mesh from the image.
 *
 * The silhouette comes from the alpha channel (or a luminance/border threshold for opaque
 * images) and the surface height from luminance, so the output genuinely follows the
 * uploaded picture — front and back shells plus a stitched rim, textured with the image.
 */
export class MockProvider implements ImageTo3DProvider {
  readonly name = "mock";

  async generate(imagePath: string, opts: GenerateOptions): Promise<GenerateResult> {
    const grid = QUALITY_GRID[opts.quality];
    const src = sharp(await readFile(imagePath));
    const meta = await src.metadata();
    if (!meta.width || !meta.height) throw new ProcessingError("INVALID_IMAGE", "The uploaded image could not be read.");
    const aspect = meta.width / meta.height;
    const gw = aspect >= 1 ? grid : Math.max(16, Math.round(grid * aspect));
    const gh = aspect >= 1 ? Math.max(16, Math.round(grid / aspect)) : grid;

    const { data } = await src.clone().resize(gw, gh, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const hasAlpha = (() => {
      for (let i = 3; i < data.length; i += 4) if (data[i]! < 250) return true;
      return false;
    })();

    // Occupancy mask + height field.
    const mask = new Uint8Array(gw * gh);
    const height = new Float32Array(gw * gh);
    let bgR = 0, bgG = 0, bgB = 0, bgN = 0;
    if (!hasAlpha) {
      for (let x = 0; x < gw; x++) {
        for (const y of [0, gh - 1]) {
          const o = (y * gw + x) * 4;
          bgR += data[o]!; bgG += data[o + 1]!; bgB += data[o + 2]!; bgN++;
        }
      }
      bgR /= Math.max(1, bgN); bgG /= Math.max(1, bgN); bgB /= Math.max(1, bgN);
    }
    for (let i = 0; i < gw * gh; i++) {
      const r = data[i * 4]!, g = data[i * 4 + 1]!, b = data[i * 4 + 2]!, a = data[i * 4 + 3]!;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const inside = hasAlpha ? a > 128 : Math.hypot(r - bgR, g - bgG, b - bgB) > 42;
      mask[i] = inside ? 1 : 0;
      height[i] = inside ? 0.25 + 0.75 * lum : 0;
    }
    // Smooth the height field so the relief is not stepped.
    const smooth = new Float32Array(height);
    for (let y = 1; y < gh - 1; y++) {
      for (let x = 1; x < gw - 1; x++) {
        const i = y * gw + x;
        if (!mask[i]) continue;
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const j = i + dy * gw + dx;
            if (!mask[j]) continue;
            sum += height[j]!;
            n++;
          }
        }
        smooth[i] = n ? sum / n : height[i]!;
      }
    }

    const filled = mask.reduce((n, v) => n + v, 0);
    if (filled < 32) {
      throw new ProcessingError("AI_NO_SUBJECT", "We could not find a subject in that image. Use a photo with a clear object on a plain or transparent background.");
    }

    const scale = 1 / Math.max(gw, gh);
    const depth = 0.18;
    const meshes: MeshData[] = [];
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const indexOf = new Int32Array(gw * gh * 2).fill(-1);
    const addVertex = (x: number, y: number, back: boolean) => {
      const i = y * gw + x;
      const slot = back ? gw * gh + i : i;
      if (indexOf[slot]! >= 0) return indexOf[slot]!;
      const h = smooth[i]! * depth;
      positions.push((x - gw / 2) * scale, (gh / 2 - y) * scale, back ? -h : h);
      uvs.push(x / (gw - 1), y / (gh - 1));
      indexOf[slot] = positions.length / 3 - 1;
      return indexOf[slot]!;
    };
    for (let y = 0; y < gh - 1; y++) {
      for (let x = 0; x < gw - 1; x++) {
        const quad = [y * gw + x, y * gw + x + 1, (y + 1) * gw + x + 1, (y + 1) * gw + x];
        if (!quad.every((i) => mask[i])) continue;
        const f = [addVertex(x, y, false), addVertex(x + 1, y, false), addVertex(x + 1, y + 1, false), addVertex(x, y + 1, false)];
        indices.push(f[0]!, f[3]!, f[1]!, f[1]!, f[3]!, f[2]!);
        const b = [addVertex(x, y, true), addVertex(x + 1, y, true), addVertex(x + 1, y + 1, true), addVertex(x, y + 1, true)];
        indices.push(b[0]!, b[1]!, b[3]!, b[1]!, b[2]!, b[3]!);
      }
    }
    // Rim: stitch front to back wherever the mask ends.
    for (let y = 0; y < gh - 1; y++) {
      for (let x = 0; x < gw - 1; x++) {
        const i = y * gw + x;
        if (!mask[i]) continue;
        const right = mask[i + 1];
        const down = mask[i + gw];
        if (!right) {
          const f0 = addVertex(x, y, false), f1 = addVertex(x, y + 1, false);
          const b0 = addVertex(x, y, true), b1 = addVertex(x, y + 1, true);
          indices.push(f0, f1, b0, b1, b0, f1);
        }
        if (!down) {
          const f0 = addVertex(x, y, false), f1 = addVertex(x + 1, y, false);
          const b0 = addVertex(x, y, true), b1 = addVertex(x + 1, y, true);
          indices.push(f0, b0, f1, f1, b0, b1);
        }
      }
    }
    if (indices.length < 3) throw new ProcessingError("AI_NO_SUBJECT", "The subject in that image was too small to build a mesh from.");

    const mesh: MeshData = { name: "ai_prop", material: "ai_prop_material", positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
    meshes.push({ ...mesh, normals: computeNormals(mesh) });

    const texture = await sharp(await readFile(imagePath)).resize(1024, 1024, { fit: "cover" }).png().toBuffer();
    const materials: MaterialData[] = [
      { name: "ai_prop_material", baseColor: [1, 1, 1, 1], metallic: 0, roughness: 0.7, diffuse: { name: "ai_prop_diffuse", buffer: texture } },
    ];
    opts.onProgress?.(0.9, "Building the mesh");
    const glbPath = path.join(opts.workDir, "generated.glb");
    await writeFile(glbPath, await buildGlb(meshes, materials, { name: "ai_prop" }));
    const previewPngPath = path.join(opts.workDir, "generated-preview.png");
    await writeFile(previewPngPath, await sharp(texture).resize(512, 512, { fit: "cover" }).png().toBuffer());
    return { glbPath, previewPngPath, provider: this.name };
  }
}

interface PollOptions {
  url: string;
  headers: Record<string, string>;
  /** Extracts { done, failed, glbUrl, progress } from a status payload. */
  read(payload: Record<string, unknown>): { done: boolean; failed?: string; glbUrl?: string; progress?: number };
  onProgress?: (fraction: number, message?: string) => void;
  timeoutMs?: number;
}

async function poll(opts: PollOptions): Promise<string> {
  const deadline = Date.now() + (opts.timeoutMs ?? 12 * 60_000);
  let delay = 3_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.25, 15_000);
    const res = await fetch(opts.url, { headers: opts.headers });
    if (!res.ok) {
      if (res.status >= 500) continue;
      throw new ProcessingError("AI_PROVIDER_ERROR", `The 3D provider returned HTTP ${res.status}`, { retryable: res.status === 429 });
    }
    const payload = (await res.json()) as Record<string, unknown>;
    const state = opts.read(payload);
    if (state.failed) throw new ProcessingError("AI_GENERATION_FAILED", `The 3D provider could not generate a model: ${state.failed}`);
    if (typeof state.progress === "number") opts.onProgress?.(Math.max(0, Math.min(1, state.progress)), "Generating");
    if (state.done) {
      if (!state.glbUrl) throw new ProcessingError("AI_GENERATION_FAILED", "The 3D provider finished without returning a model file.");
      return state.glbUrl;
    }
  }
  throw new ProcessingError("AI_TIMEOUT", "The 3D provider did not finish in time. Your credits have been returned.", { infrastructure: true, retryable: true });
}

async function downloadGlb(url: string, dest: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new ProcessingError("AI_PROVIDER_ERROR", `Could not download the generated model (HTTP ${res.status})`, { infrastructure: true, retryable: true });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 64) throw new ProcessingError("AI_GENERATION_FAILED", "The generated model file was empty.");
  await writeFile(dest, buf);
  return dest;
}

/** Tripo3D image-to-3D. */
export class TripoProvider implements ImageTo3DProvider {
  readonly name = "tripo";
  constructor(private readonly apiKey: string) {}

  async generate(imagePath: string, opts: GenerateOptions): Promise<GenerateResult> {
    const headers = { authorization: `Bearer ${this.apiKey}` };
    const image = await readFile(imagePath);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(image)]), path.basename(imagePath));
    const uploadRes = await fetch("https://api.tripo3d.ai/v2/openapi/upload", { method: "POST", headers, body: form });
    if (!uploadRes.ok) throw new ProcessingError("AI_PROVIDER_ERROR", `Tripo upload failed (HTTP ${uploadRes.status})`, { infrastructure: uploadRes.status >= 500, retryable: uploadRes.status >= 500 });
    const uploaded = (await uploadRes.json()) as { data?: { image_token?: string } };
    const token = uploaded.data?.image_token;
    if (!token) throw new ProcessingError("AI_PROVIDER_ERROR", "Tripo did not return an image token.", { infrastructure: true });

    const taskRes = await fetch("https://api.tripo3d.ai/v2/openapi/task", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ type: "image_to_model", file: { type: "png", file_token: token }, texture: true, pbr: opts.quality !== "draft", model_version: "v2.0-20240919" }),
    });
    if (!taskRes.ok) throw new ProcessingError("AI_PROVIDER_ERROR", `Tripo task failed (HTTP ${taskRes.status})`, { infrastructure: taskRes.status >= 500, retryable: taskRes.status >= 500 });
    const task = (await taskRes.json()) as { data?: { task_id?: string } };
    const taskId = task.data?.task_id;
    if (!taskId) throw new ProcessingError("AI_PROVIDER_ERROR", "Tripo did not return a task id.", { infrastructure: true });

    const glbUrl = await poll({
      url: `https://api.tripo3d.ai/v2/openapi/task/${taskId}`,
      headers,
      onProgress: opts.onProgress,
      read: (payload) => {
        const d = (payload.data ?? {}) as { status?: string; progress?: number; output?: { pbr_model?: string; model?: string } };
        return {
          done: d.status === "success",
          failed: d.status === "failed" || d.status === "cancelled" || d.status === "banned" ? (d.status ?? "failed") : undefined,
          glbUrl: d.output?.pbr_model ?? d.output?.model,
          progress: typeof d.progress === "number" ? d.progress / 100 : undefined,
        };
      },
    });
    log.info({ taskId }, "tripo generation complete");
    return { glbPath: await downloadGlb(glbUrl, path.join(opts.workDir, "generated.glb")), provider: this.name, externalId: taskId };
  }
}

/** Meshy image-to-3D. */
export class MeshyProvider implements ImageTo3DProvider {
  readonly name = "meshy";
  constructor(private readonly apiKey: string) {}

  async generate(imagePath: string, opts: GenerateOptions): Promise<GenerateResult> {
    const headers = { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" };
    const image = await readFile(imagePath);
    const mime = imagePath.toLowerCase().endsWith(".png") ? "image/png" : imagePath.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg";
    const createRes = await fetch("https://api.meshy.ai/openapi/v1/image-to-3d", {
      method: "POST",
      headers,
      body: JSON.stringify({
        image_url: `data:${mime};base64,${image.toString("base64")}`,
        enable_pbr: opts.quality !== "draft",
        should_remesh: true,
        target_polycount: opts.quality === "high" ? 60000 : opts.quality === "standard" ? 30000 : 12000,
      }),
    });
    if (!createRes.ok) throw new ProcessingError("AI_PROVIDER_ERROR", `Meshy task failed (HTTP ${createRes.status})`, { infrastructure: createRes.status >= 500, retryable: createRes.status >= 500 });
    const created = (await createRes.json()) as { result?: string; id?: string };
    const taskId = created.result ?? created.id;
    if (!taskId) throw new ProcessingError("AI_PROVIDER_ERROR", "Meshy did not return a task id.", { infrastructure: true });

    const glbUrl = await poll({
      url: `https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`,
      headers: { authorization: `Bearer ${this.apiKey}` },
      onProgress: opts.onProgress,
      read: (payload) => {
        const status = payload.status as string | undefined;
        const urls = (payload.model_urls ?? {}) as { glb?: string };
        return {
          done: status === "SUCCEEDED",
          failed: status === "FAILED" || status === "CANCELED" ? ((payload.task_error as { message?: string } | undefined)?.message ?? status) : undefined,
          glbUrl: urls.glb,
          progress: typeof payload.progress === "number" ? (payload.progress as number) / 100 : undefined,
        };
      },
    });
    return { glbPath: await downloadGlb(glbUrl, path.join(opts.workDir, "generated.glb")), provider: this.name, externalId: taskId };
  }
}

/** Self-hosted endpoint: POST the image, receive a GLB (or a job URL to poll). */
export class CustomProvider implements ImageTo3DProvider {
  readonly name = "custom";
  constructor(private readonly endpoint: string, private readonly apiKey?: string) {}

  async generate(imagePath: string, opts: GenerateOptions): Promise<GenerateResult> {
    const image = await readFile(imagePath);
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(image)]), path.basename(imagePath));
    form.append("quality", opts.quality);
    if (opts.prompt) form.append("prompt", opts.prompt);
    const res = await fetch(this.endpoint, { method: "POST", headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : undefined, body: form });
    if (!res.ok) throw new ProcessingError("AI_PROVIDER_ERROR", `The configured AI endpoint returned HTTP ${res.status}`, { infrastructure: res.status >= 500, retryable: res.status >= 500 });
    const contentType = res.headers.get("content-type") ?? "";
    const dest = path.join(opts.workDir, "generated.glb");
    if (contentType.includes("json")) {
      const payload = (await res.json()) as { glbUrl?: string; url?: string; statusUrl?: string };
      const direct = payload.glbUrl ?? payload.url;
      if (direct) return { glbPath: await downloadGlb(direct, dest), provider: this.name };
      if (payload.statusUrl) {
        const glbUrl = await poll({
          url: payload.statusUrl,
          headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
          onProgress: opts.onProgress,
          read: (p) => ({ done: p.status === "done" || p.status === "succeeded", failed: p.status === "failed" ? String(p.error ?? "failed") : undefined, glbUrl: (p.glbUrl ?? p.url) as string | undefined, progress: typeof p.progress === "number" ? (p.progress as number) : undefined }),
        });
        return { glbPath: await downloadGlb(glbUrl, dest), provider: this.name };
      }
      throw new ProcessingError("AI_PROVIDER_ERROR", "The configured AI endpoint returned JSON without a model URL.", { infrastructure: true });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) throw new ProcessingError("AI_GENERATION_FAILED", "The AI endpoint returned an empty model.");
    await writeFile(dest, buf);
    return { glbPath: dest, provider: this.name };
  }
}

/** Build the provider configured by AI_3D_PROVIDER. */
export function createProvider(): ImageTo3DProvider {
  const env = workerEnv();
  switch (env.aiProvider) {
    case "tripo":
      if (!env.aiApiKey) throw new ProcessingError("AI_NOT_CONFIGURED", "The AI 3D provider is not configured on this server.", { infrastructure: true });
      return new TripoProvider(env.aiApiKey);
    case "meshy":
      if (!env.aiApiKey) throw new ProcessingError("AI_NOT_CONFIGURED", "The AI 3D provider is not configured on this server.", { infrastructure: true });
      return new MeshyProvider(env.aiApiKey);
    case "custom":
      if (!env.aiEndpoint) throw new ProcessingError("AI_NOT_CONFIGURED", "AI_3D_ENDPOINT is not set on this server.", { infrastructure: true });
      return new CustomProvider(env.aiEndpoint, env.aiApiKey ?? undefined);
    default:
      return new MockProvider();
  }
}
