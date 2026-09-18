import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { storage } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "optional" }, async ({ params, user }) => {
  const i = await prisma.showcaseItem.findFirst({ where: { slug: params.slug, status: "PUBLISHED" }, include: { user: { select: { username: true, avatarUrl: true } }, creation: { select: { metadata: true, createdAt: true } } } });
  if (!i) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Not found", 404);
  const s = storage();
  const liked = user ? !!(await prisma.showcaseLike.findUnique({ where: { itemId_userId: { itemId: i.id, userId: user.id } } })) : false;
  return json({ slug: i.slug, title: i.title, description: i.description, category: i.category, toolSlug: i.toolSlug, tags: i.tags, likeCount: i.likeCount, viewCount: i.viewCount, allowDownload: i.allowDownload, allowRemix: i.allowRemix, publishedAt: i.publishedAt, creator: i.user, liked, isOwner: user?.id === i.userId, thumbnailUrl: i.thumbnailKey ? await s.signedGetUrl(i.thumbnailKey, { ttl: 3600 }) : null, screenshots: await Promise.all(i.screenshotKeys.map((k) => s.signedGetUrl(k, { ttl: 3600 }))), stats: i.creation.metadata });
});
