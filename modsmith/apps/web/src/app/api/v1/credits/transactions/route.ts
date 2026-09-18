import { z } from "zod";
import { prisma } from "@modsmith/db";
import { apiRoute, json, paginationQuery } from "@/server/api";

export const GET = apiRoute({ auth: "required", query: paginationQuery.extend({ type: z.string().optional() }) }, async ({ user, query }) => {
  const where = { userId: user!.id, ...(query.type ? { type: query.type as any } : {}) };
  const [total, transactions] = await Promise.all([
    prisma.creditTransaction.count({ where }),
    prisma.creditTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return json({ total, page: query.page, pageSize: query.pageSize, transactions });
});
