import { z } from "zod";
import { prisma } from "@modsmith/db";
import { apiRoute, json, paginationQuery } from "@/server/api";
import { MOD } from "../_lib";

export const GET = apiRoute({ ...MOD, query: paginationQuery.extend({ status: z.string().optional() }) }, async ({ query }) => {
  const where = query.status ? { status: query.status as any } : {};
  const [total, items] = await Promise.all([prisma.review.count({ where }), prisma.review.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { user: { select: { username: true, email: true } }, creation: { select: { name: true } } } })]);
  return json({ total, page: query.page, pageSize: query.pageSize, items });
});
