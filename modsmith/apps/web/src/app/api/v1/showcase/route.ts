import { z } from "zod";
import { prisma } from "@modsmith/db";
import { storage } from "@modsmith/services";
import { apiRoute, json, paginationQuery } from "@/server/api";

const q = paginationQuery.extend({ category: z.string().optional(), toolSlug: z.string().optional(), sort: z.enum(["recent", "popular", "liked"]).default("recent"), q: z.string().max(80).optional() });

export const GET = apiRoute({ auth: "none", query: q }, async ({ query }) => {
  const where = { status: "PUBLISHED" as const, ...(query.category ? { category: query.category } : {}), ...(query.toolSlug ? { toolSlug: query.toolSlug } : {}), ...(query.q ? { OR: [{ title: { contains: query.q, mode: "insensitive" as const } }, { tags: { has: query.q.toLowerCase() } }] } : {}) };
  const orderBy = query.sort === "popular" ? { viewCount: "desc" as const } : query.sort === "liked" ? { likeCount: "desc" as const } : { publishedAt: "desc" as const };
  const [total, items] = await Promise.all([
    prisma.showcaseItem.count({ where }),
    prisma.showcaseItem.findMany({ where, orderBy: [{ featured: "desc" }, orderBy], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { user: { select: { username: true, avatarUrl: true } } } }),
  ]);
  const s = storage();
  return json({ total, page: query.page, pageSize: query.pageSize, items: await Promise.all(items.map(async (i) => ({ slug: i.slug, title: i.title, category: i.category, toolSlug: i.toolSlug, tags: i.tags, likeCount: i.likeCount, viewCount: i.viewCount, featured: i.featured, allowDownload: i.allowDownload, publishedAt: i.publishedAt, creator: i.user, thumbnailUrl: i.thumbnailKey ? await s.signedGetUrl(i.thumbnailKey, { ttl: 3600 }) : null }))) });
});
