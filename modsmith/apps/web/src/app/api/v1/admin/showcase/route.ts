import { z } from "zod";
import { prisma } from "@modsmith/db";
import { apiRoute, json, paginationQuery } from "@/server/api";
import { MOD } from "../_lib";

export const GET = apiRoute({ ...MOD, query: paginationQuery.extend({ status: z.string().optional(), q: z.string().optional() }) }, async ({ query }) => {
  const where = { ...(query.status ? { status: query.status as any } : {}), ...(query.q ? { title: { contains: query.q, mode: "insensitive" as const } } : {}) };
  const [total, items] = await Promise.all([prisma.showcaseItem.count({ where }), prisma.showcaseItem.findMany({ where, orderBy: { publishedAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { user: { select: { username: true } }, _count: { select: { reports: true } } } })]);
  return json({ total, page: query.page, pageSize: query.pageSize, items });
});
