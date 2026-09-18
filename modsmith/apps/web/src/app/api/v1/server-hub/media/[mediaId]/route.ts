import { z } from "zod";
import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { deleteMedia, storage } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

/** Returns a short-lived private link (view or download). */
export const GET = apiRoute({ auth: "required", query: z.object({ download: z.string().optional(), ttl: z.coerce.number().int().min(60).max(3600).default(300) }) }, async ({ user, params, query }) => {
  const m = await prisma.serverHubMedia.findFirst({ where: { id: params.mediaId, deletedAt: null, project: { userId: user!.id } } });
  if (!m) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Media not found", 404);
  const url = await storage().signedGetUrl(m.storageKey, { ttl: query.ttl, downloadName: query.download ? `${m.kind.toLowerCase()}-${m.id}.${m.mime.split("/")[1]}` : undefined });
  return json({ id: m.id, url, expiresIn: query.ttl, mime: m.mime, sizeBytes: Number(m.sizeBytes), metadata: m.metadata, createdAt: m.createdAt });
});

export const DELETE = apiRoute({ auth: "required" }, async ({ user, params }) => {
  await deleteMedia(params.mediaId!, user!.id);
  return json({ ok: true });
});
