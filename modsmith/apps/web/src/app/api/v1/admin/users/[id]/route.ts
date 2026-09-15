import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, adminUserUpdateSchema } from "@modsmith/core";
import { audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { ADMIN, MOD, serialize } from "../../_lib";

export const GET = apiRoute(MOD, async ({ params }) => {
  const u = await prisma.user.findUnique({ where: { id: params.id }, include: { creditAccount: true, discordConnection: { select: { discordId: true, username: true, connectedAt: true } }, subscriptions: { include: { plan: { select: { name: true } } }, orderBy: { createdAt: "desc" } }, creditPurchases: { orderBy: { createdAt: "desc" }, take: 20 }, sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, userAgent: true, lastSeenAt: true } }, _count: { select: { jobs: true, creations: true, reviews: true, serverHubProjects: true } } } });
  if (!u) throw new ApiFailure(ErrorCodes.NOT_FOUND, "User not found", 404);
  const [transactions, jobs, auditLogs] = await Promise.all([
    prisma.creditTransaction.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.processingJob.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, toolSlug: true, status: true, chargedCredits: true, createdAt: true, errorCode: true } }),
    prisma.auditLog.findMany({ where: { OR: [{ actorId: u.id }, { targetType: "user", targetId: u.id }] }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const { passwordHash: _p, ...safe } = u;
  return json(serialize({ ...safe, transactions, jobs, auditLogs }));
});

export const PATCH = apiRoute({ ...ADMIN, body: adminUserUpdateSchema }, async ({ user, params, body, ip, userAgent }) => {
  const before = await prisma.user.findUnique({ where: { id: params.id }, select: { status: true, role: true, emailVerifiedAt: true } });
  if (!before) throw new ApiFailure(ErrorCodes.NOT_FOUND, "User not found", 404);
  if (params.id === user!.id && body.status === "SUSPENDED") throw new ApiFailure(ErrorCodes.CONFLICT, "You cannot suspend yourself", 409);
  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.role) data.role = body.role;
  if (body.emailVerified !== undefined) data.emailVerifiedAt = body.emailVerified ? new Date() : null;
  const u = await prisma.user.update({ where: { id: params.id }, data, select: { id: true, status: true, role: true, emailVerifiedAt: true } });
  if (body.status === "SUSPENDED") await prisma.session.updateMany({ where: { userId: params.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (body.role === "ADMIN") await prisma.adminUser.upsert({ where: { userId: params.id }, create: { userId: params.id!, permissions: ["*"] }, update: {} });
  await audit({ actorId: user!.id, actorType: "admin", action: "admin.user.update", targetType: "user", targetId: params.id, before, after: data, ip, userAgent });
  return json(u);
});
