import { prisma, type LogLevel, type MediaKind, type Prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, LIMITS, type hubLogEventSchema } from "@modsmith/core";
import type { z } from "zod";
import { hmacToken, randomToken, sha256 } from "./crypto";
import { redis } from "./redis";
import { storage } from "./storage";
import { getSetting } from "./settings";
import { audit } from "./audit";

export type HubLogEvent = z.infer<typeof hubLogEventSchema>;

/** Server tokens: shown once, HMAC-hashed at rest, scoped to exactly one project. */
export async function createServerToken(projectId: string, name: string, actorId: string) {
  const raw = `msh_${randomToken(32)}`;
  const token = await prisma.serverHubToken.create({ data: { projectId, name, prefix: raw.slice(0, 12), tokenHash: hmacToken(raw) } });
  await audit({ actorId, action: "hub.token.create", targetType: "hubToken", targetId: token.id, after: { projectId, name } });
  return { token: raw, record: token };
}

export async function revokeServerToken(tokenId: string, actorId: string) {
  const t = await prisma.serverHubToken.update({ where: { id: tokenId }, data: { revokedAt: new Date() } });
  try { await redis().del(`hubtoken:${t.tokenHash}`); } catch { /* ignore */ }
  await audit({ actorId, action: "hub.token.revoke", targetType: "hubToken", targetId: tokenId });
  return t;
}

/** Resolves a bearer token to its project. Cached briefly in Redis. Never returns dashboard data. */
export async function authenticateServerToken(header: string | null) {
  if (!header?.startsWith("Bearer ")) throw new ApiFailure(ErrorCodes.UNAUTHORIZED, "Missing bearer token", 401);
  const raw = header.slice(7).trim();
  if (!raw.startsWith("msh_") || raw.length < 20) throw new ApiFailure(ErrorCodes.UNAUTHORIZED, "Invalid token", 401);
  const hash = hmacToken(raw);
  let cached: { tokenId: string; projectId: string; userId: string } | null = null;
  try { const c = await redis().get(`hubtoken:${hash}`); if (c) cached = JSON.parse(c); } catch { /* ignore */ }
  if (!cached) {
    const t = await prisma.serverHubToken.findUnique({ where: { tokenHash: hash }, include: { project: { select: { id: true, userId: true, deletedAt: true } } } });
    if (!t || t.revokedAt || t.project.deletedAt) throw new ApiFailure(ErrorCodes.UNAUTHORIZED, "Invalid or revoked token", 401);
    cached = { tokenId: t.id, projectId: t.project.id, userId: t.project.userId };
    try { await redis().set(`hubtoken:${hash}`, JSON.stringify(cached), "EX", 60); } catch { /* ignore */ }
  }
  prisma.serverHubToken.update({ where: { id: cached.tokenId }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return cached;
}

const LEVEL_MAP: Record<string, LogLevel> = { debug: "DEBUG", info: "INFO", warn: "WARN", error: "ERROR", fatal: "FATAL" };

function parseTimestamp(ts: string | number | undefined): Date {
  if (ts === undefined) return new Date();
  const d = typeof ts === "number" ? new Date(ts < 1e12 ? ts * 1000 : ts) : new Date(ts);
  if (Number.isNaN(d.getTime())) return new Date();
  // Clamp to ±1 day to prevent retention abuse
  const now = Date.now();
  return new Date(Math.min(Math.max(d.getTime(), now - 86400_000), now + 300_000));
}

export function serializeMetadata(meta: Record<string, unknown> | undefined): string | null {
  if (!meta) return null;
  const parts: string[] = [];
  const walk = (v: unknown, prefix: string) => {
    if (v === null || v === undefined) return;
    if (typeof v === "object" && !Array.isArray(v)) { for (const [k, val] of Object.entries(v as Record<string, unknown>)) walk(val, prefix ? `${prefix}.${k}` : k); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${prefix}[${i}]`)); return; }
    parts.push(`${prefix}=${String(v)}`);
  };
  walk(meta, "");
  return parts.join(" ").slice(0, 8000) || null;
}

/** Strip IP-like identifiers from player metadata by default. */
function sanitizeMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return meta;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (/^(ip|ipaddr|ip_address|endpoint|remote_?addr)$/i.test(k)) continue;
    if (typeof v === "string" && /^ip:/.test(v)) continue;
    out[k] = v;
  }
  return out;
}

export async function ingestLogs(projectId: string, userId: string, events: HubLogEvent[], requestId?: string) {
  const retention = await getRetentionDays(userId);
  const expiresAt = new Date(Date.now() + retention * 86400_000);
  const datasetNames = Array.from(new Set(events.map((e) => e.dataset ?? "default")));
  const datasets = new Map<string, string>();
  for (const name of datasetNames) {
    const ds = await prisma.serverHubDataset.upsert({ where: { projectId_name: { projectId, name } }, create: { projectId, name }, update: {} });
    datasets.set(name, ds.id);
  }
  const rows: Prisma.ServerHubLogCreateManyInput[] = events.map((e, i) => {
    const meta = sanitizeMetadata(e.metadata);
    return {
      projectId,
      datasetId: datasets.get(e.dataset ?? "default")!,
      level: LEVEL_MAP[e.level] ?? "INFO",
      message: e.message,
      resource: e.resource ?? null,
      metadata: meta as Prisma.InputJsonValue | undefined,
      metadataText: serializeMetadata(meta),
      playerSource: e.player?.source ?? null,
      targetSource: e.player?.target ?? null,
      playerLicense: e.player?.license ?? null,
      playerDiscord: e.player?.discord ?? null,
      playerName: e.player?.name ?? null,
      eventId: e.id ?? (requestId ? `${requestId}:${i}` : sha256(`${projectId}|${e.message}|${e.timestamp ?? ""}|${i}|${Date.now()}`).slice(0, 32)),
      occurredAt: parseTimestamp(e.timestamp),
      expiresAt,
    };
  });
  const res = await prisma.serverHubLog.createMany({ data: rows, skipDuplicates: true });
  // dataset counters
  const counts = new Map<string, number>();
  for (const e of events) { const k = datasets.get(e.dataset ?? "default")!; counts.set(k, (counts.get(k) ?? 0) + 1); }
  for (const [id, c] of counts) await prisma.serverHubDataset.update({ where: { id }, data: { eventCount: { increment: c }, lastEventAt: new Date() } });
  return { accepted: res.count, duplicates: rows.length - res.count };
}

export async function getRetentionDays(userId: string) {
  const sub = await prisma.subscription.findFirst({ where: { userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] }, plan: { kind: "SERVER_HUB" } }, include: { plan: true } });
  if (sub?.plan.hubRetentionDays) return sub.plan.hubRetentionDays;
  const q = await prisma.storageQuota.findUnique({ where: { userId } });
  return q?.retentionDays ?? (await getSetting<number>("hub.defaultRetentionDays"));
}

export async function getStorageLimits(userId: string) {
  const sub = await prisma.subscription.findFirst({ where: { userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] }, plan: { kind: "SERVER_HUB" } }, include: { plan: true } });
  const quota = await prisma.storageQuota.upsert({ where: { userId }, create: { userId, limitBytes: BigInt(await getSetting<number>("hub.freeStorageBytes")), retentionDays: await getSetting<number>("hub.defaultRetentionDays") }, update: {} });
  const limit = sub?.plan.hubStorageBytes ?? quota.limitBytes;
  const maxServers = sub?.plan.hubMaxServers ?? (await getSetting<number>("hub.freeMaxServers"));
  return { limitBytes: limit, usedBytes: quota.usedBytes, retentionDays: sub?.plan.hubRetentionDays ?? quota.retentionDays, maxServers, plan: sub?.plan ?? null };
}

export const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function createMediaReservation(projectId: string, userId: string, opts: { kind: MediaKind; mime?: string; maxBytes?: number; metadata?: Record<string, unknown> }) {
  const limits = await getStorageLimits(userId);
  const maxBytes = Math.min(opts.maxBytes ?? LIMITS.HUB_MEDIA_MAX_BYTES, LIMITS.HUB_MEDIA_MAX_BYTES);
  if (limits.usedBytes + BigInt(maxBytes) > limits.limitBytes) throw new ApiFailure(ErrorCodes.FORBIDDEN, "Storage quota exceeded", 403, { code: "QUOTA_EXCEEDED" });
  const id = randomToken(12);
  const ext = opts.mime ? MIME_EXT[opts.mime] ?? "bin" : "bin";
  const storageKey = `hub/${projectId}/${opts.kind.toLowerCase()}/${id}.${ext}`;
  const uploadToken = randomToken(32);
  const ttl = LIMITS.RESERVATION_TTL_SECONDS;
  const reservation = await prisma.mediaReservation.create({ data: { projectId, kind: opts.kind, storageKey, uploadToken: hmacToken(uploadToken), maxBytes, allowedMimes: opts.mime ? [opts.mime] : Object.keys(MIME_EXT), metadata: (opts.metadata ?? {}) as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + ttl * 1000) } });
  return { reservation, uploadToken, ttl, maxBytes };
}

export const MAGIC: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", test: (b) => b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];
export function sniffImageMime(buf: Buffer): string | null {
  return MAGIC.find((m) => m.test(buf))?.mime ?? null;
}

/** Finalize a reservation with the uploaded bytes (validated by magic bytes and size). */
export async function completeMediaReservation(reservationId: string, uploadToken: string, body: Buffer) {
  const r = await prisma.mediaReservation.findUnique({ where: { id: reservationId }, include: { project: { select: { userId: true } } } });
  if (!r || r.uploadToken !== hmacToken(uploadToken)) throw new ApiFailure(ErrorCodes.UNAUTHORIZED, "Invalid reservation", 401);
  if (r.status !== "PENDING") throw new ApiFailure(ErrorCodes.CONFLICT, "Reservation already used", 409);
  if (r.expiresAt < new Date()) { await prisma.mediaReservation.update({ where: { id: r.id }, data: { status: "EXPIRED" } }); throw new ApiFailure(ErrorCodes.UPLOAD_EXPIRED, "Reservation expired", 410); }
  if (body.length > r.maxBytes) throw new ApiFailure(ErrorCodes.FILE_TOO_LARGE, `File exceeds ${r.maxBytes} bytes`, 413);
  const mime = sniffImageMime(body);
  if (!mime || !r.allowedMimes.includes(mime)) { await prisma.mediaReservation.update({ where: { id: r.id }, data: { status: "REJECTED" } }); throw new ApiFailure(ErrorCodes.INVALID_FILE, "File is not a supported image", 415); }
  const dims = readImageDimensions(body, mime);
  await storage().putObject(r.storageKey, body, mime);
  const meta = (r.metadata ?? {}) as { player?: { source?: number; license?: string; discord?: string; name?: string }; reason?: string; reportId?: string };
  const media = await prisma.$transaction(async (tx) => {
    const m = await tx.serverHubMedia.create({ data: { projectId: r.projectId, kind: r.kind, storageKey: r.storageKey, mime, sizeBytes: BigInt(body.length), width: dims?.width, height: dims?.height, sha256: sha256(body), playerSource: meta.player?.source ?? null, playerLicense: meta.player?.license ?? null, playerDiscord: meta.player?.discord ?? null, playerName: meta.player?.name ?? null, reason: meta.reason ?? null, reportId: meta.reportId ?? null, metadata: r.metadata ?? undefined, reservationId: r.id } });
    await tx.mediaReservation.update({ where: { id: r.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await tx.storageQuota.update({ where: { userId: r.project.userId }, data: { usedBytes: { increment: body.length } } }).catch(() => {});
    return m;
  });
  return media;
}

export function readImageDimensions(buf: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === "image/png") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (mime === "image/jpeg") {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1]!;
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (mime === "image/webp") {
      const chunk = buf.subarray(12, 16).toString("ascii");
      if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
      if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
  } catch { /* ignore */ }
  return null;
}

export async function deleteMedia(mediaId: string, userId: string) {
  const m = await prisma.serverHubMedia.findFirst({ where: { id: mediaId, deletedAt: null, project: { userId } } });
  if (!m) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Media not found", 404);
  await storage().deleteObject(m.storageKey).catch(() => {});
  await prisma.$transaction([
    prisma.serverHubMedia.update({ where: { id: m.id }, data: { deletedAt: new Date() } }),
    prisma.storageQuota.update({ where: { userId }, data: { usedBytes: { decrement: m.sizeBytes } } }),
  ]);
}
