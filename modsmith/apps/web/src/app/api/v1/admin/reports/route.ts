import { z } from "zod";
import { prisma } from "@modsmith/db";
import { apiRoute, json, paginationQuery } from "@/server/api";
import { MOD } from "../_lib";

export const GET = apiRoute({ ...MOD, query: paginationQuery.extend({ status: z.string().optional() }) }, async ({ query }) => {
  const where = query.status ? { status: query.status } : {};
  const [total, items] = await Promise.all([prisma.abuseReport.count({ where }), prisma.abuseReport.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { reporter: { select: { username: true } }, showcaseItem: { select: { slug: true, title: true, status: true } } } })]);
  return json({ total, page: query.page, pageSize: query.pageSize, items });
});
