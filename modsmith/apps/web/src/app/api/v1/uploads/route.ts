import { prisma } from "@modsmith/db";
import { LIMITS, uploadInitSchema } from "@modsmith/core";
import { RATE_LIMITS, objectKey, randomToken, storage, validateUploadRequest } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

/**
 * Initializes an upload. Small files get one signed PUT URL; large files get a multipart upload
 * with signed part URLs. Bytes go straight to object storage — never through the app server.
 */
export const POST = apiRoute({ auth: "required", body: uploadInitSchema, rateLimit: RATE_LIMITS.uploads }, async ({ user, body }) => {
  validateUploadRequest(body.toolSlug, body.fileName, body.sizeBytes);
  const id = randomToken(12);
  const key = objectKey({ scope: "uploads", userId: user!.id, id, name: body.fileName });
  const expiresAt = new Date(Date.now() + LIMITS.UPLOAD_TTL_HOURS * 3600_000);
  const multipart = body.sizeBytes > LIMITS.UPLOAD_SINGLE_PUT_MAX_BYTES;
  const s = storage();
  let multipartUploadId: string | null = null;
  let partUrls: { partNumber: number; url: string }[] = [];
  let putUrl: string | null = null;
  if (multipart) {
    multipartUploadId = await s.createMultipart(key, body.mime ?? "application/octet-stream");
    const parts = Math.ceil(body.sizeBytes / LIMITS.MULTIPART_PART_BYTES);
    partUrls = await Promise.all(Array.from({ length: parts }, (_, i) => s.signedPartUrl(key, multipartUploadId!, i + 1, 3600).then((url) => ({ partNumber: i + 1, url }))));
  } else {
    putUrl = await s.signedPutUrl(key, { mime: body.mime, ttl: 3600 });
  }
  const upload = await prisma.assetUpload.create({ data: { userId: user!.id, toolSlug: body.toolSlug, originalName: body.fileName, storageKey: key, sizeBytes: BigInt(body.sizeBytes), declaredMime: body.mime, status: "UPLOADING", multipartUploadId, partCount: partUrls.length || null, expiresAt } });
  return json({ uploadId: upload.id, key, multipart, putUrl, multipartUploadId, partUrls, partSize: LIMITS.MULTIPART_PART_BYTES, expiresAt }, { status: 201 });
});

export const GET = apiRoute({ auth: "required" }, async ({ user }) => {
  const uploads = await prisma.assetUpload.findMany({ where: { userId: user!.id, deletedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, toolSlug: true, originalName: true, sizeBytes: true, status: true, detectedMime: true, createdAt: true, expiresAt: true } });
  return json({ uploads: uploads.map((u) => ({ ...u, sizeBytes: Number(u.sizeBytes) })) });
});
