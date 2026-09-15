import { z } from "zod";
import { prisma } from "@modsmith/db";
import { apiRoute, json, paginationQuery } from "@/server/api";

export const GET = apiRoute({ auth: "required", query: paginationQuery.extend({ unread: z.string().optional() }) }, async ({ user, query }) => {
  const where = { userId: user!.id, ...(query.unread === "1" ? { readAt: null } : {}) };
  const [total, unread, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user!.id, readAt: null } }),
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return json({ total, unread, notifications });
});
