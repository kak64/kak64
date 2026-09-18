import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { storage, audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

/** Public download of a showcase item — only when the creator explicitly enabled it. */
export const GET = apiRoute({ auth: "required" }, async ({ params, user }) => {
  const i = await prisma.showcaseItem.findFirst({ where: { slug: params.slug, status: "PUBLISHED" }, include: { creation: { include: { currentVersion: true } } } });
  if (!i) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Not found", 404);
  if (!i.allowDownload && i.userId !== user!.id) throw new ApiFailure(ErrorCodes.FORBIDDEN, "The creator has not enabled downloads for this item", 403);
  const v = i.creation.currentVersion;
  if (!v) throw new ApiFailure(ErrorCodes.NOT_FOUND, "No resource available", 404);
  const url = await storage().signedGetUrl(v.resourceKey, { ttl: 300, downloadName: v.resourceName, mime: "application/zip" });
  await audit({ actorId: user!.id, action: "showcase.download", targetType: "showcase", targetId: i.id });
  return json({ url, fileName: v.resourceName });
});
