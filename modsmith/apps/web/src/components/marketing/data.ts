import { prisma } from "@modsmith/db";
import { storage } from "@modsmith/services";
import type { PricingPack, PricingPlan } from "./pricing";
import type { ShowcaseCardItem } from "./showcase-card";
import type { PartnerCardItem } from "./partner-card";

export { siteUrl } from "./site";

export const THUMB_TTL = 3600;

export async function signedOrNull(key: string | null | undefined, ttl = THUMB_TTL) {
  if (!key) return null;
  try { return await storage().signedGetUrl(key, { ttl }); } catch { return null; }
}

type RawShowcase = { slug: string; title: string; category: string; toolSlug: string; likeCount: number; viewCount: number; publishedAt: Date; featured: boolean; thumbnailKey: string | null; user?: { username: string } };

export async function toShowcaseCards(items: RawShowcase[]): Promise<ShowcaseCardItem[]> {
  return Promise.all(items.map(async (i) => ({
    slug: i.slug, title: i.title, category: i.category, toolSlug: i.toolSlug, likeCount: i.likeCount, viewCount: i.viewCount, publishedAt: i.publishedAt, featured: i.featured,
    thumbnailUrl: await signedOrNull(i.thumbnailKey),
    creator: i.user ? { username: i.user.username } : null,
  })));
}

export const showcaseCardSelect = { slug: true, title: true, category: true, toolSlug: true, likeCount: true, viewCount: true, publishedAt: true, featured: true, thumbnailKey: true, user: { select: { username: true } } } as const;

export async function loadPricing(): Promise<{ packs: PricingPack[]; plans: PricingPlan[] }> {
  const [packs, plans] = await Promise.all([
    prisma.creditPack.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return {
    packs: packs.map((p) => ({ id: p.id, slug: p.slug, name: p.name, credits: p.credits, bonusCredits: p.bonusCredits, priceCents: p.priceCents, currency: p.currency, isCustom: p.isCustom, minCredits: p.minCredits, maxCredits: p.maxCredits, badge: p.badge })),
    plans: plans.map((p) => ({
      id: p.id, slug: p.slug, kind: p.kind, name: p.name, description: p.description, monthlyPriceCents: p.monthlyPriceCents, yearlyPriceCents: p.yearlyPriceCents, currency: p.currency,
      monthlyCredits: p.monthlyCredits, exportDiscountPct: p.exportDiscountPct, premiumTools: p.premiumTools, aiTools: p.aiTools, faceDailyExports: p.faceDailyExports,
      hubStorageGb: p.hubStorageBytes ? Math.round(Number(p.hubStorageBytes) / 1024 ** 3) : null, hubRetentionDays: p.hubRetentionDays, hubMaxServers: p.hubMaxServers,
      features: Array.isArray(p.features) ? (p.features as unknown[]).filter((f): f is string => typeof f === "string") : [],
    })),
  };
}

export async function loadPartners(): Promise<PartnerCardItem[]> {
  const rows = await prisma.partner.findMany({ where: { active: true }, orderBy: [{ priority: "desc" }, { name: "asc" }] });
  return Promise.all(rows.map(async (p) => ({
    slug: p.slug, name: p.name, description: p.description, category: p.category, website: p.website, discordUrl: p.discordUrl, youtubeUrl: p.youtubeUrl, referralCode: p.referralCode, bonusCredits: p.bonusCredits,
    logoUrl: p.logoUrl ?? (await signedOrNull(p.logoKey)),
  })));
}
