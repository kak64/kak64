import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, uploadCompleteSchema } from "@modsmith/core";
import { sha256 as sha, storage, verifyContent, audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

/**
 * Finalizes an upload: completes multipart if needed, verifies the object exists and its size,
 * sniffs the real content type from the first bytes (spoofed extensions are rejected) and computes SHA-256.
 */
export const POST = apiRoute({ auth: "required", body: uploadCompleteSchema.omit({ uploadId: true }) }, async ({ user, params, body }) => {
  const u = await prisma.assetUpload.findFirst({ where: { id: params.id, userId: user!.id, deletedAt: null } });
  if (!u) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Upload not found", 404);
  if (u.expiresAt < new Date()) throw new ApiFailure(ErrorCodes.UPLOAD_EXPIRED, "Upload expired", 410);
  if (u.status === "UPLOADED" || u.status === "VALIDATED") return json({ id: u.id, status: u.status, sha256: u.sha256, detectedMime: u.detectedMime });
  const s = storage();
  if (u.multipartUploadId) {
    if (!body.parts?.length) throw new ApiFailure(ErrorCodes.VALIDATION_ERROR, "Missing multipart parts", 400);
    await s.completeMultipart(u.storageKey, u.multipartUploadId, body.parts);
  }
  const head = await s.headObject(u.storageKey);
  if (!head) throw new ApiFailure(ErrorCodes.INVALID_FILE, "Uploaded object not found", 400);
  if (BigInt(head.size) !== u.sizeBytes) {
    await s.deleteObject(u.storageKey).catch(() => {});
    await prisma.assetUpload.update({ where: { id: u.id }, data: { status: "REJECTED", rejectReason: "size_mismatch" } });
    throw new ApiFailure(ErrorCodes.INVALID_FILE, "Uploaded size does not match the declared size", 400);
  }
  // Content sniffing + hash. Objects are private; we read them server-side.
  const buf = await s.getObject(u.storageKey);
  if (!buf) throw new ApiFailure(ErrorCodes.INVALID_FILE, "Uploaded object not readable", 400);
  let detectedMime: string;
  try {
    detectedMime = verifyContent(u.originalName, buf.subarray(0, 4096));
  } catch (err) {
    await s.deleteObject(u.storageKey).catch(() => {});
    await prisma.assetUpload.update({ where: { id: u.id }, data: { status: "REJECTED", rejectReason: (err as Error).message } });
    throw err;
  }
  const digest = sha(buf);
  if (body.sha256 && body.sha256 !== digest) {
    await s.deleteObject(u.storageKey).catch(() => {});
    await prisma.assetUpload.update({ where: { id: u.id }, data: { status: "REJECTED", rejectReason: "hash_mismatch" } });
    throw new ApiFailure(ErrorCodes.INVALID_FILE, "File hash mismatch — the upload may have been corrupted", 400);
  }
  const updated = await prisma.assetUpload.update({ where: { id: u.id }, data: { status: "UPLOADED", detectedMime, sha256: digest, scanStatus: "pending" } });
  await audit({ actorId: user!.id, action: "upload.complete", targetType: "upload", targetId: u.id, after: { name: u.originalName, size: Number(u.sizeBytes), mime: detectedMime } });
  return json({ id: updated.id, status: updated.status, sha256: digest, detectedMime });
});
