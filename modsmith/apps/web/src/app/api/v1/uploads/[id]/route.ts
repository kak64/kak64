import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { storage } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const u = await prisma.assetUpload.findFirst({ where: { id: params.id, userId: user!.id, deletedAt: null } });
  if (!u) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Upload not found", 404);
  const previewUrl = u.status === "UPLOADED" || u.status === "VALIDATED" ? await storage().signedGetUrl(u.storageKey, { ttl: 900 }) : null;
  return json({ id: u.id, originalName: u.originalName, sizeBytes: Number(u.sizeBytes), status: u.status, detectedMime: u.detectedMime, sha256: u.sha256, expiresAt: u.expiresAt, previewUrl });
});

export const DELETE = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const u = await prisma.assetUpload.findFirst({ where: { id: params.id, userId: user!.id, deletedAt: null } });
  if (!u) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Upload not found", 404);
  if (u.multipartUploadId && u.status === "UPLOADING") await storage().abortMultipart(u.storageKey, u.multipartUploadId).catch(() => {});
  else await storage().deleteObject(u.storageKey).catch(() => {});
  await prisma.assetUpload.update({ where: { id: u.id }, data: { status: "DELETED", deletedAt: new Date() } });
  return json({ ok: true });
});
