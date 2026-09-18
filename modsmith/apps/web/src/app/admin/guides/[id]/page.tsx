import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { prisma } from "@modsmith/db";
import { TOOLS } from "@modsmith/core";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { GuideEditor } from "@/components/admin/guide-editor";
import type { Faq } from "@/components/admin/editor-parts";
import { requireStaff } from "@/components/admin/guard";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit guide", robots: { index: false, follow: false } };

export default async function AdminEditGuidePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const [guide, categories] = await Promise.all([
    prisma.guide.findUnique({ where: { id } }),
    prisma.guideCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!guide) notFound();

  const faqs: Faq[] = Array.isArray(guide.faqs)
    ? (guide.faqs as unknown[]).map((f) => { const o = (f ?? {}) as { question?: unknown; answer?: unknown }; return { question: String(o.question ?? ""), answer: String(o.answer ?? "") }; })
    : [];

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/admin/guides"><ArrowLeft />All guides</Link></Button>
      <PageHeader title={guide.title} description={`Updated ${formatDateTime(guide.updatedAt)}`}
        actions={guide.state === "PUBLISHED" ? <Button asChild variant="outline" size="sm"><a href={`/guides/${guide.slug}`} target="_blank" rel="noreferrer">View live<ExternalLink /></a></Button> : undefined} />
      <GuideEditor
        categories={categories}
        tools={TOOLS.map((t) => ({ slug: t.slug, name: t.name }))}
        initial={{
          id: guide.id, slug: guide.slug, categoryId: guide.categoryId, title: guide.title, intro: guide.intro, content: guide.content,
          coverKey: guide.coverKey ?? "", seoTitle: guide.seoTitle ?? "", seoDescription: guide.seoDescription ?? "",
          faqs, relatedSlugs: guide.relatedSlugs, toolSlug: guide.toolSlug ?? "", state: guide.state,
        }}
      />
    </div>
  );
}
