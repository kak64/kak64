import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TOOLS } from "@modsmith/core";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { ChangelogEditor } from "@/components/admin/changelog-editor";
import { requireStaff } from "@/components/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminNewChangelogPage() {
  await requireStaff();
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/admin/changelog"><ArrowLeft />All entries</Link></Button>
      <PageHeader title="New changelog entry" />
      <ChangelogEditor tools={TOOLS.map((t) => ({ slug: t.slug, name: t.name }))}
        initial={{ version: "", title: "", category: "feature", description: "", screenshotKeys: [], toolSlug: "", state: "DRAFT", publishedAt: "" }} />
    </div>
  );
}
