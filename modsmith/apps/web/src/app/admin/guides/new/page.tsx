import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@modsmith/db";
import { TOOLS } from "@modsmith/core";
import { Button } from "@/components/ui/button";
import { PageHeader, Alert } from "@/components/ui/misc";
import { GuideEditor } from "@/components/admin/guide-editor";
import { requireStaff } from "@/components/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminNewGuidePage() {
  await requireStaff();
  const categories = await prisma.guideCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/admin/guides"><ArrowLeft />All guides</Link></Button>
      <PageHeader title="New guide" description="Drafts stay private until you set the state to Published." />
      {categories.length === 0 ? <Alert variant="warning" title="No categories yet">Create a guide category first — a guide must belong to one.</Alert> : null}
      <GuideEditor
        categories={categories}
        tools={TOOLS.map((t) => ({ slug: t.slug, name: t.name }))}
        initial={{ slug: "", categoryId: categories[0]?.id ?? "", title: "", intro: "", content: "", coverKey: "", seoTitle: "", seoDescription: "", faqs: [], relatedSlugs: [], toolSlug: "", state: "DRAFT" }}
      />
    </div>
  );
}
