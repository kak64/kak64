import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rm, stat, writeFile, type FileHandle } from "node:fs/promises";
import path from "node:path";
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand,
  HeadObjectCommand, PutObjectCommand, S3Client, UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";
import { LIMITS } from "@modsmith/core";
import { hmacToken, safeEqual } from "./crypto";

/**
 * Storage provider abstraction. Objects are always private; access is via short-lived signed URLs.
 * - s3: any S3-compatible store (Cloudflare R2, MinIO, AWS)
 * - local: filesystem under apps/web/.storage, with signed URLs served by /api/v1/uploads/local (dev/test only)
 */
export interface StorageProvider {
  putObject(key: string, body: Buffer | Uint8Array, mime: string): Promise<void>;
  getObject(key: string): Promise<Buffer | null>;
  /** Reads a byte range without fetching the whole object (used for content sniffing). */
  getRange(key: string, start: number, endInclusive: number): Promise<Buffer | null>;
  /** Streams an object so large files can be hashed without being buffered in memory. */
  getStream(key: string): Promise<NodeJS.ReadableStream | null>;
  headObject(key: string): Promise<{ size: number; mime?: string } | null>;
  deleteObject(key: string): Promise<void>;
  signedGetUrl(key: string, opts?: { ttl?: number; downloadName?: string; mime?: string }): Promise<string>;
  signedPutUrl(key: string, opts: { ttl?: number; mime?: string; maxBytes?: number }): Promise<string>;
  createMultipart(key: string, mime: string): Promise<string>;
  signedPartUrl(key: string, uploadId: string, partNumber: number, ttl?: number): Promise<string>;
  completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
}

class S3Provider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  constructor() {
    const e = env();
    this.bucket = e.S3_BUCKET;
    this.client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      forcePathStyle: e.S3_FORCE_PATH_STYLE === "true",
      credentials: e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY } : undefined,
    });
  }
  async putObject(key: string, body: Buffer | Uint8Array, mime: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mime }));
  }
  async getObject(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NoSuchKey") return null;
      throw e;
    }
  }
  async getRange(key: string, start: number, endInclusive: number) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=${start}-${endInclusive}` }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NoSuchKey") return null;
      throw e;
    }
  }
  async getStream(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return (res.Body as NodeJS.ReadableStream | undefined) ?? null;
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NoSuchKey") return null;
      throw e;
    }
  }
  async headObject(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, mime: res.ContentType };
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NotFound") return null;
      throw e;
    }
  }
  async deleteObject(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  signedGetUrl(key: string, opts?: { ttl?: number; downloadName?: string; mime?: string }) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: opts?.downloadName ? `attachment; filename="${encodeURIComponent(opts.downloadName)}"` : undefined,
        ResponseContentType: opts?.mime,
      }),
      { expiresIn: opts?.ttl ?? LIMITS.SIGNED_URL_TTL_SECONDS },
    );
  }
  signedPutUrl(key: string, opts: { ttl?: number; mime?: string; maxBytes?: number }) {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: opts.mime, ContentLength: opts.maxBytes }), { expiresIn: opts.ttl ?? LIMITS.SIGNED_URL_TTL_SECONDS });
  }
  async createMultipart(key: string, mime: string) {
    const res = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: mime }));
    return res.UploadId!;
  }
  signedPartUrl(key: string, uploadId: string, partNumber: number, ttl = 3600) {
    return getSignedUrl(this.client, new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: ttl });
  }
  async completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
    await this.client.send(new CompleteMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts.sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) } }));
  }
  async abortMultipart(key: string, uploadId: string) {
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
  }
}

/** Local provider: signed URLs are HMAC-signed paths served by the app itself. Dev/test only. */
export class LocalProvider implements StorageProvider {
  readonly root: string;
  constructor(root = process.env.LOCAL_STORAGE_DIR ?? path.resolve(process.cwd(), "../../.storage")) {
    this.root = root;
  }
  private p(key: string) {
    const safe = path.normalize(key).replace(/^(\.\.[/\\])+/, "");
    const full = path.join(this.root, safe);
    if (!full.startsWith(this.root)) throw new Error("bad key");
    return full;
  }
  async putObject(key: string, body: Buffer | Uint8Array, mime: string) {
    const full = this.p(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    await writeFile(full + ".meta.json", JSON.stringify({ mime }));
  }
  async getObject(key: string) {
    try { return await readFile(this.p(key)); } catch { return null; }
  }
  async getRange(key: string, start: number, endInclusive: number) {
    let handle: FileHandle | undefined;
    try {
      handle = await open(this.p(key), "r");
      const length = endInclusive - start + 1;
      const buf = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buf, 0, length, start);
      return buf.subarray(0, bytesRead);
    } catch { return null; } finally { await handle?.close(); }
  }
  async getStream(key: string) {
    try {
      await stat(this.p(key));
      return createReadStream(this.p(key));
    } catch { return null; }
  }
  async headObject(key: string) {
    try {
      const s = await stat(this.p(key));
      let mime: string | undefined;
      try { mime = JSON.parse(await readFile(this.p(key) + ".meta.json", "utf8")).mime; } catch { /* none */ }
      return { size: s.size, mime };
    } catch { return null; }
  }
  async deleteObject(key: string) {
    await rm(this.p(key), { force: true });
    await rm(this.p(key) + ".meta.json", { force: true });
  }
  sign(key: string, exp: number, extra = "") {
    return hmacToken(`${key}|${exp}|${extra}`).slice(0, 40);
  }
  verify(key: string, exp: number, sig: string, extra = "") {
    return exp > Date.now() / 1000 && safeEqual(this.sign(key, exp, extra), sig);
  }
  async signedGetUrl(key: string, opts?: { ttl?: number; downloadName?: string }) {
    const exp = Math.floor(Date.now() / 1000) + (opts?.ttl ?? LIMITS.SIGNED_URL_TTL_SECONDS);
    const q = new URLSearchParams({ key, exp: String(exp), sig: this.sign(key, exp, "get") });
    if (opts?.downloadName) q.set("dl", opts.downloadName);
    return `${env().APP_URL}/api/v1/uploads/local?${q.toString()}`;
  }
  async signedPutUrl(key: string, opts: { ttl?: number; mime?: string }) {
    const exp = Math.floor(Date.now() / 1000) + (opts.ttl ?? LIMITS.SIGNED_URL_TTL_SECONDS);
    const q = new URLSearchParams({ key, exp: String(exp), sig: this.sign(key, exp, "put") });
    return `${env().APP_URL}/api/v1/uploads/local?${q.toString()}`;
  }
  async createMultipart(key: string) {
    const id = createHash("sha1").update(key + Date.now()).digest("hex");
    await mkdir(this.p(`${key}.parts-${id}`), { recursive: true });
    return id;
  }
  async signedPartUrl(key: string, uploadId: string, partNumber: number, ttl = 3600) {
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const q = new URLSearchParams({ key, exp: String(exp), sig: this.sign(key, exp, `part:${uploadId}:${partNumber}`), uploadId, partNumber: String(partNumber) });
    return `${env().APP_URL}/api/v1/uploads/local?${q.toString()}`;
  }
  async completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
    const dir = this.p(`${key}.parts-${uploadId}`);
    const chunks: Buffer[] = [];
    for (const p of parts.sort((a, b) => a.partNumber - b.partNumber)) chunks.push(await readFile(path.join(dir, String(p.partNumber))));
    await this.putObject(key, Buffer.concat(chunks), "application/octet-stream");
    await rm(dir, { recursive: true, force: true });
  }
  async abortMultipart(key: string, uploadId: string) {
    await rm(this.p(`${key}.parts-${uploadId}`), { recursive: true, force: true });
  }
}

const g = globalThis as unknown as { __storage?: StorageProvider };
export function storage(): StorageProvider {
  if (!g.__storage) g.__storage = env().STORAGE_PROVIDER === "local" ? new LocalProvider() : new S3Provider();
  return g.__storage;
}

/**
 * Computes the SHA-256 of a stored object without buffering it in memory.
 * Returns null when the object is missing.
 */
export async function hashObject(key: string): Promise<{ sha256: string; size: number } | null> {
  const stream = await storage().getStream(key);
  if (!stream) return null;
  const hash = createHash("sha256");
  let size = 0;
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      size += buf.length;
      hash.update(buf);
    });
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return { sha256: hash.digest("hex"), size };
}

export function objectKey(parts: { scope: "uploads" | "results" | "thumbs" | "hub" | "ai" | "external" | "avatars"; userId?: string; projectId?: string; id: string; name: string }) {
  const safeName = parts.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "file";
  if (parts.scope === "hub") return `hub/${parts.projectId}/${parts.id}/${safeName}`;
  return `${parts.scope}/${parts.userId ?? "system"}/${parts.id}/${safeName}`;
}
