import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { audit, storage } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { ADMIN, serialize } from "../../_lib";

/** Admin removal of a Server Hub media object: deletes the stored object, the row and frees the owner's quota. */
export const DELETE = apiRoute(ADMIN, async ({ user, params, ip, userAgent }) => {
  const media = await prisma.serverHubMedia.findUnique({
    where: { id: params.id },
    include: { project: { select: { id: true, name: true, userId: true } } },
  });
  if (!media) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Media not found", 404);

  await storage().deleteObject(media.storageKey).catch(() => {});
  await prisma.$transaction([
    prisma.serverHubMedia.delete({ where: { id: media.id } }),
    prisma.storageQuota.updateMany({ where: { userId: media.project.userId }, data: { usedBytes: { decrement: media.sizeBytes } } }),
  ]);
  await audit({
    actorId: user!.id, actorType: "admin", action: "admin.hubMedia.delete", targetType: "hubMedia", targetId: media.id,
    before: serialize({ projectId: media.projectId, ownerId: media.project.userId, kind: media.kind, storageKey: media.storageKey, sizeBytes: media.sizeBytes, createdAt: media.createdAt }),
    ip, userAgent,
  });
  return json({ ok: true });
});
