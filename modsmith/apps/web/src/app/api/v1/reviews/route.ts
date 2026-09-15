import { z } from "zod";
import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, reviewSchema } from "@modsmith/core";
import { RATE_LIMITS, isFlagEnabled, audit } from "@modsmith/services";
import { apiRoute, json, paginationQuery } from "@/server/api";

export const GET = apiRoute({ auth: "none", query: paginationQuery.extend({ toolSlug: z.string().optional() }) }, async ({ query }) => {
  const where = { status: "APPROVED" as const, ...(query.toolSlug ? { toolSlug: query.toolSlug } : {}) };
  const [total, reviews, agg] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { user: { select: { username: true, avatarUrl: true } }, creation: { select: { name: true, showcaseItem: { select: { slug: true, status: true } } } } } }),
    prisma.review.aggregate({ where, _avg: { rating: true } }),
  ]);
  return json({ total, page: query.page, pageSize: query.pageSize, average: agg._avg.rating ?? 0, reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, text: r.text, toolSlug: r.toolSlug, createdAt: r.createdAt, user: r.user, creation: r.creation ? { name: r.creation.name, slug: r.creation.showcaseItem?.status === "PUBLISHED" ? r.creation.showcaseItem.slug : null } : null })) });
});

/** Users may review after at least one completed export ("qualifying product usage"). */
export const POST = apiRoute({ auth: "required", body: reviewSchema, requireVerified: true, rateLimit: RATE_LIMITS.review }, async ({ user, body }) => {
  if (!(await isFlagEnabled("reviews"))) throw new ApiFailure(ErrorCodes.TOOL_DISABLED, "Reviews are temporarily closed", 403);
  const completed = await prisma.processingJob.count({ where: { userId: user!.id, status: "COMPLETED" } });
  if (completed === 0) throw new ApiFailure(ErrorCodes.FORBIDDEN, "Complete at least one export before leaving a review", 403);
  if (body.creationId) {
    const c = await prisma.creation.findFirst({ where: { id: body.creationId, userId: user!.id } });
    if (!c) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Creation not found", 404);
  }
  const r = await prisma.review.create({ data: { userId: user!.id, rating: body.rating, text: body.text, creationId: body.creationId, toolSlug: body.toolSlug, status: "PENDING" } });
  await audit({ actorId: user!.id, action: "review.create", targetType: "review", targetId: r.id });
  return json({ id: r.id, status: r.status }, { status: 201 });
});
