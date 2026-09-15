import { z } from "zod";
import { prisma } from "@modsmith/db";
import { apiRoute, json, paginationQuery } from "@/server/api";
import { MOD } from "../_lib";

export const GET = apiRoute({ ...MOD, query: paginationQuery.extend({ q: z.string().max(100).optional(), status: z.string().optional(), role: z.string().optional() }) }, async ({ query }) => {
  const where = { ...(query.q ? { OR: [{ email: { contains: query.q, mode: "insensitive" as const } }, { username: { contains: query.q, mode: "insensitive" as const } }, { id: query.q }] } : {}), ...(query.status ? { status: query.status as any } : {}), ...(query.role ? { role: query.role as any } : {}) };
  const [total, users] = await Promise.all([prisma.user.count({ where }), prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, email: true, username: true, role: true, status: true, emailVerifiedAt: true, createdAt: true, lastLoginAt: true, creditAccount: { select: { balance: true } }, discordConnection: { select: { username: true } }, _count: { select: { jobs: true, creations: true } } } })]);
  return json({ total, page: query.page, pageSize: query.pageSize, users });
});
