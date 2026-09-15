import { prisma } from "@modsmith/db";
import { hashIp } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const POST = apiRoute({ auth: "optional" }, async ({ params, user, ip }) => {
  const i = await prisma.showcaseItem.findFirst({ where: { slug: params.slug, status: "PUBLISHED" }, select: { id: true } });
  if (!i) return json({ ok: true });
  const viewerHash = user?.id ?? hashIp(ip) ?? "anon";
  const day = new Date().toISOString().slice(0, 10);
  try {
    await prisma.showcaseView.create({ data: { itemId: i.id, viewerHash, day } });
    await prisma.showcaseItem.update({ where: { id: i.id }, data: { viewCount: { increment: 1 } } });
  } catch { /* duplicate for today */ }
  return json({ ok: true });
});
