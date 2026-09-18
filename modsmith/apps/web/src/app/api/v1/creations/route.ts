import { z } from "zod";
import { prisma } from "@modsmith/db";
import { apiRoute, json, paginationQuery } from "@/server/api";
import { storage } from "@modsmith/services";

const q = paginationQuery.extend({ toolSlug: z.string().optional(), status: z.string().optional(), from: z.string().optional(), to: z.string().optional(), q: z.string().max(100).optional(), sort: z.enum(["newest", "oldest", "name"]).default("newest") });

export const GET = apiRoute({ auth: "required", query: q }, async ({ user, query }) => {
  const where = {
    userId: user!.id,
    deletedAt: null,
    ...(query.toolSlug ? { toolSlug: query.toolSlug } : {}),
    ...(query.status ? { status: query.status as any } : {}),
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
  };
  const orderBy = query.sort === "name" ? { name: "asc" as const } : { createdAt: query.sort === "oldest" ? ("asc" as const) : ("desc" as const) };
  const [total, items] = await Promise.all([
    prisma.creation.count({ where }),
    prisma.creation.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { currentVersion: { select: { id: true, version: true, resourceName: true, sizeBytes: true, createdAt: true } }, currentJob: { select: { id: true, status: true, stage: true, progress: true } }, showcaseItem: { select: { slug: true, status: true } } } }),
  ]);
  const s = storage();
  const creations = await Promise.all(items.map(async (c) => ({
    id: c.id, toolSlug: c.toolSlug, name: c.name, originalFilename: c.originalFilename, status: c.status, exportVersion: c.exportVersion, lastCreditCost: c.lastCreditCost, reexportUntil: c.reexportUntil, isPublic: c.isPublic, createdAt: c.createdAt, updatedAt: c.updatedAt,
    thumbnailUrl: c.thumbnailKey ? await s.signedGetUrl(c.thumbnailKey, { ttl: 3600 }) : null,
    currentVersion: c.currentVersion ? { ...c.currentVersion, sizeBytes: Number(c.currentVersion.sizeBytes) } : null,
    currentJob: c.currentJob, showcase: c.showcaseItem,
  })));
  return json({ total, page: query.page, pageSize: query.pageSize, creations });
});
