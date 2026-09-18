import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "optional" }, async ({ params }) => {
  const u = await prisma.user.findFirst({ where: { usernameNormalized: params.username!.toLowerCase(), status: "ACTIVE" }, select: { id: true, username: true, avatarUrl: true, bio: true, profilePublic: true, createdAt: true } });
  if (!u || !u.profilePublic) throw new ApiFailure(ErrorCodes.NOT_FOUND, "User not found", 404);
  const items = await prisma.showcaseItem.findMany({ where: { userId: u.id, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 24, select: { slug: true, title: true, category: true, toolSlug: true, thumbnailKey: true, likeCount: true, viewCount: true, publishedAt: true } });
  return json({ user: { username: u.username, avatarUrl: u.avatarUrl, bio: u.bio, createdAt: u.createdAt }, showcase: items });
});
