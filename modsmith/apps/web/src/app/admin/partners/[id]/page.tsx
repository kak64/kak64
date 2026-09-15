import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@modsmith/db";
import { Button } from "@/components/ui/button";
import { PageHeader, Stat } from "@/components/ui/misc";
import { PartnerEditor } from "@/components/admin/partner-editor";
import { requireAdmin } from "@/components/admin/guard";
import { formatCredits } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit partner", robots: { index: false, follow: false } };

export default async function AdminEditPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [partner, stats] = await Promise.all([
    prisma.partner.findUnique({ where: { id } }),
    prisma.partnerReferral.groupBy({ by: ["event"], where: { partnerId: id }, _count: { _all: true } }),
  ]);
  if (!partner) notFound();
  const countFor = (event: string) => stats.find((s) => s.event === event)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/admin/partners"><ArrowLeft />All partners</Link></Button>
      <PageHeader title={partner.name} description={`Referral code ${partner.referralCode}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Clicks" value={countFor("click").toLocaleString("en-US")} />
        <Stat label="Signups" value={countFor("signup").toLocaleString("en-US")} />
        <Stat label="Bonuses paid" value={countFor("bonus").toLocaleString("en-US")} />
        <Stat label="Bonus per signup" value={formatCredits(partner.bonusCredits)} hint="credits" />
      </div>
      <PartnerEditor initial={{
        id: partner.id, slug: partner.slug, name: partner.name, logoUrl: partner.logoUrl ?? "", description: partner.description,
        category: partner.category, website: partner.website ?? "", discordUrl: partner.discordUrl ?? "", youtubeUrl: partner.youtubeUrl ?? "",
        twitterUrl: partner.twitterUrl ?? "", priority: partner.priority, active: partner.active, referralCode: partner.referralCode,
        bonusCredits: partner.bonusCredits, pageContent: partner.pageContent ?? "",
      }} />
    </div>
  );
}
