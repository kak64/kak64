import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { PartnerEditor } from "@/components/admin/partner-editor";
import { requireAdmin } from "@/components/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminNewPartnerPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/admin/partners"><ArrowLeft />All partners</Link></Button>
      <PageHeader title="New partner" />
      <PartnerEditor initial={{ slug: "", name: "", logoUrl: "", description: "", category: "community", website: "", discordUrl: "", youtubeUrl: "", twitterUrl: "", priority: 0, active: true, referralCode: "", bonusCredits: 0, pageContent: "" }} />
    </div>
  );
}
