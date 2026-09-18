import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { apiRoute, json } from "@/server/api";

export const POST = apiRoute({ auth: "required" }, async ({ params, user }) => {
  const i = await prisma.showcaseItem.findFirst({ where: { slug: params.slug, status: "PUBLISHED" } });
  if (!i) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Not found", 404);
  const existing = await prisma.showcaseLike.findUnique({ where: { itemId_userId: { itemId: i.id, userId: user!.id } } });
  if (existing) {
    await prisma.$transaction([prisma.showcaseLike.delete({ where: { id: existing.id } }), prisma.showcaseItem.update({ where: { id: i.id }, data: { likeCount: { decrement: 1 } } })]);
    return json({ liked: false, likeCount: i.likeCount - 1 });
  }
  await prisma.$transaction([prisma.showcaseLike.create({ data: { itemId: i.id, userId: user!.id } }), prisma.showcaseItem.update({ where: { id: i.id }, data: { likeCount: { increment: 1 } } })]);
  return json({ liked: true, likeCount: i.likeCount + 1 });
});
