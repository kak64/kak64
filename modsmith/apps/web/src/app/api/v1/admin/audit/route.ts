import { z } from "zod";
import { prisma } from "@modsmith/db";
import { apiRoute, json, paginationQuery } from "@/server/api";
import { ADMIN } from "../_lib";

export const GET = apiRoute({ ...ADMIN, query: paginationQuery.extend({ action: z.string().optional(), actorId: z.string().optional(), targetId: z.string().optional() }) }, async ({ query }) => {
  const where = { ...(query.action ? { action: { startsWith: query.action } } : {}), ...(query.actorId ? { actorId: query.actorId } : {}), ...(query.targetId ? { targetId: query.targetId } : {}) };
  const [total, items] = await Promise.all([prisma.auditLog.count({ where }), prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { actor: { select: { username: true } } } })]);
  return json({ total, page: query.page, pageSize: query.pageSize, items });
});
