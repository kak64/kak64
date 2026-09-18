import { prisma } from "@modsmith/db";
import { stripeConfigured } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { ADMIN } from "../_lib";

export const GET = apiRoute(ADMIN, async () => {
  const [events, purchases, subs] = await Promise.all([
    prisma.stripeWebhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.creditPurchase.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { username: true } }, pack: { select: { name: true } } } }),
    prisma.subscription.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { username: true } }, plan: { select: { name: true } } } }),
  ]);
  return json({ configured: stripeConfigured(), events, purchases, subscriptions: subs });
});
