import { z } from "zod";
import { prisma } from "@modsmith/db";
import { apiRoute, json, paginationQuery } from "@/server/api";
import { ADMIN, serialize } from "../_lib";

export const GET = apiRoute({ ...ADMIN, query: paginationQuery.extend({ q: z.string().optional() }) }, async ({ query }) => {
  const where = { deletedAt: null, ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" as const } }, { user: { username: { contains: query.q, mode: "insensitive" as const } } }] } : {}) };
  const [total, projects, totals] = await Promise.all([
    prisma.serverHubProject.count({ where }),
    prisma.serverHubProject.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { user: { select: { username: true, storageQuota: true } }, _count: { select: { logs: true, media: true, tokens: true } } } }),
    prisma.serverHubMedia.aggregate({ where: { deletedAt: null }, _sum: { sizeBytes: true }, _count: { _all: true } }),
  ]);
  const logs = await prisma.serverHubLog.count();
  return json(serialize({ total, page: query.page, pageSize: query.pageSize, projects, totals: { mediaBytes: totals._sum.sizeBytes ?? 0, media: totals._count._all, logs } }));
});
