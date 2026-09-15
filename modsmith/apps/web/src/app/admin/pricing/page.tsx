import { prisma } from "@modsmith/db";
import { PageHeader } from "@/components/ui/misc";
import { PricingManager, type AdminPlan } from "@/components/admin/pricing";
import { requireAdmin } from "@/components/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  await requireAdmin();
  const [packs, plans] = await Promise.all([
    prisma.creditPack.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const planProps: AdminPlan[] = plans.map((p) => ({
    id: p.id, slug: p.slug, kind: p.kind, name: p.name, description: p.description,
    monthlyPriceCents: p.monthlyPriceCents, yearlyPriceCents: p.yearlyPriceCents, currency: p.currency,
    stripeMonthlyPriceId: p.stripeMonthlyPriceId, stripeYearlyPriceId: p.stripeYearlyPriceId,
    monthlyCredits: p.monthlyCredits, exportDiscountPct: p.exportDiscountPct, premiumTools: p.premiumTools, aiTools: p.aiTools,
    faceDailyExports: p.faceDailyExports, hubStorageBytes: p.hubStorageBytes === null ? null : Number(p.hubStorageBytes),
    hubRetentionDays: p.hubRetentionDays, hubMaxServers: p.hubMaxServers,
    features: Array.isArray(p.features) ? (p.features as unknown[]).map(String) : [],
    sortOrder: p.sortOrder, active: p.active,
  }));
  return (
    <div className="space-y-4">
      <PageHeader title="Pricing" description="Credit packs and subscription plans. Stripe price ids must match the live Stripe catalogue." />
      <PricingManager packs={packs} plans={planProps} />
    </div>
  );
}
