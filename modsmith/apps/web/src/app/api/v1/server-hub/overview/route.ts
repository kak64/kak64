import { prisma } from "@modsmith/db";
import { getStorageLimits } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "required" }, async ({ user }) => {
  const [limits, servers, logs, media, since24h] = await Promise.all([
    getStorageLimits(user!.id),
    prisma.serverHubProject.count({ where: { userId: user!.id, deletedAt: null } }),
    prisma.serverHubLog.count({ where: { project: { userId: user!.id } } }),
    prisma.serverHubMedia.count({ where: { project: { userId: user!.id }, deletedAt: null } }),
    prisma.serverHubLog.count({ where: { project: { userId: user!.id }, receivedAt: { gte: new Date(Date.now() - 86400_000) } } }),
  ]);
  return json({ storage: { limitBytes: Number(limits.limitBytes), usedBytes: Number(limits.usedBytes) }, retentionDays: limits.retentionDays, maxServers: limits.maxServers, plan: limits.plan ? { name: limits.plan.name, slug: limits.plan.slug } : null, servers, logs, media, logsLast24h: since24h });
});
