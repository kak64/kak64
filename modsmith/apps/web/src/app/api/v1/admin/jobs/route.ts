import { z } from "zod";
import { prisma } from "@modsmith/db";
import { apiRoute, json, paginationQuery } from "@/server/api";
import { MOD, serialize } from "../_lib";

export const GET = apiRoute({ ...MOD, query: paginationQuery.extend({ status: z.string().optional(), toolSlug: z.string().optional(), userId: z.string().optional() }) }, async ({ query }) => {
  const where = { ...(query.status ? { status: query.status as any } : {}), ...(query.toolSlug ? { toolSlug: query.toolSlug } : {}), ...(query.userId ? { userId: query.userId } : {}) };
  const [total, jobs] = await Promise.all([prisma.processingJob.count({ where }), prisma.processingJob.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { user: { select: { username: true } }, creation: { select: { name: true } } } })]);
  return json(serialize({ total, page: query.page, pageSize: query.pageSize, jobs: jobs.map(({ input: _i, ...j }) => j) }));
});
