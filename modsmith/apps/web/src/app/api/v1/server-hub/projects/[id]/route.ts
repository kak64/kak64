import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, hubProjectSchema } from "@modsmith/core";
import { audit, storage } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export async function loadOwnedProject(id: string, userId: string) {
  const p = await prisma.serverHubProject.findFirst({ where: { id, userId, deletedAt: null } });
  if (!p) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Server not found", 404);
  return p;
}

export const GET = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const p = await loadOwnedProject(params.id!, user!.id);
  const [tokens, datasets, logCount, mediaCount, lastLog] = await Promise.all([
    prisma.serverHubToken.findMany({ where: { projectId: p.id }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true, revokedAt: true } }),
    prisma.serverHubDataset.findMany({ where: { projectId: p.id }, orderBy: { name: "asc" } }),
    prisma.serverHubLog.count({ where: { projectId: p.id } }),
    prisma.serverHubMedia.count({ where: { projectId: p.id, deletedAt: null } }),
    prisma.serverHubLog.findFirst({ where: { projectId: p.id }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } }),
  ]);
  return json({ ...p, tokens, datasets, logCount, mediaCount, lastLogAt: lastLog?.occurredAt ?? null });
});

export const PATCH = apiRoute({ auth: "required", body: hubProjectSchema.partial() }, async ({ user, params, body }) => {
  const p = await loadOwnedProject(params.id!, user!.id);
  const u = await prisma.serverHubProject.update({ where: { id: p.id }, data: body });
  await audit({ actorId: user!.id, action: "hub.project.update", targetType: "hubProject", targetId: p.id, after: body });
  return json({ id: u.id, name: u.name, description: u.description, framework: u.framework });
});

export const DELETE = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const p = await loadOwnedProject(params.id!, user!.id);
  const media = await prisma.serverHubMedia.findMany({ where: { projectId: p.id, deletedAt: null }, select: { storageKey: true, sizeBytes: true } });
  for (const m of media) { try { await storage().deleteObject(m.storageKey); } catch { /* ignore */ } }
  const freed = media.reduce((a, m) => a + m.sizeBytes, 0n);
  await prisma.$transaction([
    prisma.serverHubToken.updateMany({ where: { projectId: p.id }, data: { revokedAt: new Date() } }),
    prisma.serverHubLog.deleteMany({ where: { projectId: p.id } }),
    prisma.serverHubMedia.deleteMany({ where: { projectId: p.id } }),
    prisma.serverHubProject.update({ where: { id: p.id }, data: { deletedAt: new Date(), slug: `${p.slug}-deleted-${Date.now()}` } }),
    prisma.storageQuota.update({ where: { userId: user!.id }, data: { usedBytes: { decrement: freed } } }),
  ]);
  await audit({ actorId: user!.id, action: "hub.project.delete", targetType: "hubProject", targetId: p.id });
  return json({ ok: true });
});
