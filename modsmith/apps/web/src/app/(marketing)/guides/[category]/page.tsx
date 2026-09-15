import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { prisma } from "@modsmith/db";
import { EmptyState } from "@/components/ui/misc";
import { Container, PageIntro } from "@/components/marketing/section";
import { GuideCard, guideCardSelect } from "@/components/marketing/guide-card";
import { JsonLd } from "@/components/marketing/json-ld";
import { siteUrl } from "@/components/marketing/data";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category } = await params;
  const c = await prisma.guideCategory.findUnique({ where: { slug: category } });
  if (!c) return { title: "Category not found" };
  return { title: `${c.name} guides`, description: c.description ?? `Guides about ${c.name.toLowerCase()} for FiveM.`, alternates: { canonical: `/guides/${c.slug}` }, openGraph: { title: `${c.name} guides · Modsmith`, url: `/guides/${c.slug}` } };
}

export default async function GuideCategoryPage({ params }: Params) {
  const { category } = await params;
  const c = await prisma.guideCategory.findUnique({ where: { slug: category } });
  if (!c) notFound();
  const guides = await prisma.guide.findMany({ where: { state: "PUBLISHED", categoryId: c.id }, orderBy: { publishedAt: "desc" }, select: guideCardSelect });
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Guides", item: `${siteUrl()}/guides` }, { "@type": "ListItem", position: 2, name: c.name, item: `${siteUrl()}/guides/${c.slug}` }] }} />
      <PageIntro eyebrow="Guides" title={c.name} description={c.description ?? undefined}>
        <nav aria-label="Breadcrumb" className="text-sm text-fg-muted"><Link href="/guides" className="hover:text-fg">All guides</Link> <span aria-hidden>/</span> <span className="text-fg">{c.name}</span></nav>
      </PageIntro>
      <Container className="py-10">
        {guides.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {guides.map((g) => <GuideCard key={g.slug} g={g} />)}
          </div>
        ) : (
          <EmptyState icon={BookOpen} title="No guides in this category yet" action={{ label: "Browse all guides", href: "/guides" }} />
        )}
      </Container>
    </>
  );
}
