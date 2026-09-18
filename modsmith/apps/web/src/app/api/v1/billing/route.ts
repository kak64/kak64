import { prisma } from "@modsmith/db";
import { stripeConfigured } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "required" }, async ({ user }) => {
  const [account, purchases, subscriptions] = await Promise.all([
    prisma.creditAccount.findUnique({ where: { userId: user!.id } }),
    prisma.creditPurchase.findMany({ where: { userId: user!.id }, orderBy: { createdAt: "desc" }, take: 50, include: { pack: { select: { name: true } } } }),
    prisma.subscription.findMany({ where: { userId: user!.id }, orderBy: { createdAt: "desc" }, include: { plan: true, events: { orderBy: { createdAt: "desc" }, take: 5 } } }),
  ]);
  const active = subscriptions.filter((s) => ["ACTIVE", "TRIALING", "PAST_DUE"].includes(s.status));
  return json({
    stripeConfigured: stripeConfigured(),
    balance: account?.balance ?? 0,
    purchases: purchases.map((p) => ({ id: p.id, date: p.createdAt, paidAt: p.paidAt, pack: p.pack?.name ?? "Custom", credits: p.credits + p.bonusCredits, amountCents: p.amountCents, currency: p.currency, status: p.status, receiptUrl: p.receiptUrl, invoiceId: p.stripeInvoiceId })),
    subscriptions: subscriptions.map((s) => ({ id: s.id, plan: { name: s.plan.name, kind: s.plan.kind, slug: s.plan.slug, monthlyCredits: s.plan.monthlyCredits }, interval: s.interval, status: s.status, currentPeriodStart: s.currentPeriodStart, currentPeriodEnd: s.currentPeriodEnd, cancelAtPeriodEnd: s.cancelAtPeriodEnd, canceledAt: s.canceledAt, endedAt: s.endedAt, graceUntil: s.graceUntil, createdAt: s.createdAt, hasStripe: !!s.stripeSubscriptionId })),
    active: active.map((s) => ({ id: s.id, kind: s.plan.kind, planName: s.plan.name, status: s.status, currentPeriodEnd: s.currentPeriodEnd, cancelAtPeriodEnd: s.cancelAtPeriodEnd })),
  });
});
