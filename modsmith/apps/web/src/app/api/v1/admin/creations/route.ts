import { z } from "zod";
import { prisma } from "@modsmith/db";
import { apiRoute, json, paginationQuery } from "@/server/api";
import { MOD, serialize } from "../_lib";

export const GET = apiRoute({ ...MOD, query: paginationQuery.extend({ q: z.string().optional(), toolSlug: z.string().optional(), userId: z.string().optional() }) }, async ({ query }) => {
  const where = { deletedAt: null, ...(query.toolSlug ? { toolSlug: query.toolSlug } : {}), ...(query.userId ? { userId: query.userId } : {}), ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}) };
  const [total, items] = await Promise.all([prisma.creation.count({ where }), prisma.creation.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { user: { select: { username: true } }, currentVersion: { select: { version: true, sizeBytes: true } }, showcaseItem: { select: { slug: true, status: true } } } })]);
  return json(serialize({ total, page: query.page, pageSize: query.pageSize, items }));
});
