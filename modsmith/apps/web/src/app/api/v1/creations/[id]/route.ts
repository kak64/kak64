import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, creationUpdateSchema } from "@modsmith/core";
import { audit, storage } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export async function loadOwnedCreation(id: string, userId: string) {
  const c = await prisma.creation.findFirst({ where: { id, userId, deletedAt: null }, include: { upload: { select: { id: true, status: true, expiresAt: true } }, currentVersion: true, currentJob: { select: { id: true, status: true, stage: true, progress: true, errorMessage: true } }, showcaseItem: true, versions: { orderBy: { version: "desc" }, take: 20 } } });
  if (!c) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Creation not found", 404);
  return c;
}

export const GET = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const c = await loadOwnedCreation(params.id!, user!.id);
  const s = storage();
  return json({
    ...c,
    thumbnailUrl: c.thumbnailKey ? await s.signedGetUrl(c.thumbnailKey, { ttl: 3600 }) : null,
    currentVersion: c.currentVersion ? { ...c.currentVersion, sizeBytes: Number(c.currentVersion.sizeBytes) } : null,
    versions: c.versions.map((v) => ({ ...v, sizeBytes: Number(v.sizeBytes) })),
  });
});

export const PATCH = apiRoute({ auth: "required", body: creationUpdateSchema }, async ({ user, params, body }) => {
  await loadOwnedCreation(params.id!, user!.id);
  const c = await prisma.creation.update({ where: { id: params.id }, data: { ...(body.name ? { name: body.name } : {}), ...(body.projectState ? { projectState: body.projectState as any } : {}) } });
  await audit({ actorId: user!.id, action: "creation.update", targetType: "creation", targetId: c.id, after: { name: body.name, projectState: body.projectState ? "updated" : undefined } });
  return json({ id: c.id, name: c.name });
});

export const DELETE = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const c = await loadOwnedCreation(params.id!, user!.id);
  await prisma.$transaction([
    prisma.showcaseItem.deleteMany({ where: { creationId: c.id } }),
    prisma.creation.update({ where: { id: c.id }, data: { deletedAt: new Date(), isPublic: false, status: "ARCHIVED" } }),
  ]);
  for (const v of c.versions) { try { await storage().deleteObject(v.resourceKey); } catch { /* ignore */ } }
  await audit({ actorId: user!.id, action: "creation.delete", targetType: "creation", targetId: c.id });
  return json({ ok: true });
});
