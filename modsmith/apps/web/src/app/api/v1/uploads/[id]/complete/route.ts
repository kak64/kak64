import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, uploadCompleteSchema } from "@modsmith/core";
import { QUEUE_NAMES, audit, enqueue, hashObject, storage, verifyContent } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

/** Above this size the object is hashed by a worker instead of inside the request. */
const INLINE_HASH_MAX_BYTES = 256 * 1024 * 1024;

/**
 * Finalizes an upload: completes the multipart upload if needed, confirms the object exists with the
 * declared size, sniffs the real content type from a ranged read of the first bytes (spoofed
 * extensions and executables are rejected) and computes SHA-256 — inline for ordinary files, and on a
 * worker for very large ones so the request never buffers a multi-gigabyte object.
 */
export const POST = apiRoute({ auth: "required", body: uploadCompleteSchema.omit({ uploadId: true }) }, async ({ user, params, body }) => {
  const u = await prisma.assetUpload.findFirst({ where: { id: params.id, userId: user!.id, deletedAt: null } });
  if (!u) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Upload not found", 404);
  if (u.expiresAt < new Date()) throw new ApiFailure(ErrorCodes.UPLOAD_EXPIRED, "Upload expired", 410);
  if (u.status === "UPLOADED" || u.status === "VALIDATED") return json({ id: u.id, status: u.status, sha256: u.sha256, detectedMime: u.detectedMime, finalizing: false });

  const s = storage();
  if (u.multipartUploadId) {
    if (!body.parts?.length) throw new ApiFailure(ErrorCodes.VALIDATION_ERROR, "Missing multipart parts", 400);
    await s.completeMultipart(u.storageKey, u.multipartUploadId, body.parts);
  }

  const head = await s.headObject(u.storageKey);
  if (!head) throw new ApiFailure(ErrorCodes.INVALID_FILE, "Uploaded object not found", 400);
  const reject = async (reason: string) => {
    await s.deleteObject(u.storageKey).catch(() => {});
    await prisma.assetUpload.update({ where: { id: u.id }, data: { status: "REJECTED", rejectReason: reason } });
  };
  if (BigInt(head.size) !== u.sizeBytes) {
    await reject("size_mismatch");
    throw new ApiFailure(ErrorCodes.INVALID_FILE, "Uploaded size does not match the declared size", 400);
  }

  // Content sniffing only needs the first bytes, so read a range rather than the whole object.
  const headBytes = await s.getRange(u.storageKey, 0, Math.min(4095, head.size - 1));
  if (!headBytes?.length) {
    await reject("unreadable");
    throw new ApiFailure(ErrorCodes.INVALID_FILE, "Uploaded object is not readable", 400);
  }
  let detectedMime: string;
  try {
    detectedMime = verifyContent(u.originalName, headBytes);
  } catch (err) {
    await reject((err as Error).message);
    throw err;
  }

  if (head.size > INLINE_HASH_MAX_BYTES) {
    // Hashing is deferred; the upload cannot be used in a job until the worker finishes.
    await prisma.assetUpload.update({ where: { id: u.id }, data: { detectedMime, scanStatus: "finalizing" } });
    await enqueue(QUEUE_NAMES.maintenance, "finalize-upload", { uploadId: u.id }, { jobId: `finalize:${u.id}` });
    return json({ id: u.id, status: "UPLOADING", detectedMime, sha256: null, finalizing: true });
  }

  const digest = await hashObject(u.storageKey);
  if (!digest) {
    await reject("unreadable");
    throw new ApiFailure(ErrorCodes.INVALID_FILE, "Uploaded object is not readable", 400);
  }
  if (body.sha256 && body.sha256 !== digest.sha256) {
    await reject("hash_mismatch");
    throw new ApiFailure(ErrorCodes.INVALID_FILE, "File hash mismatch — the upload may have been corrupted", 400);
  }
  const updated = await prisma.assetUpload.update({ where: { id: u.id }, data: { status: "UPLOADED", detectedMime, sha256: digest.sha256, scanStatus: "pending" } });
  await audit({ actorId: user!.id, action: "upload.complete", targetType: "upload", targetId: u.id, after: { name: u.originalName, size: Number(u.sizeBytes), mime: detectedMime } });
  return json({ id: updated.id, status: updated.status, sha256: digest.sha256, detectedMime, finalizing: false });
});
