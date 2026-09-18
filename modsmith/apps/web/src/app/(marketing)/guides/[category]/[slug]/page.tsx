import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronDown } from "lucide-react";
import { prisma } from "@modsmith/db";
import { BRAND, getTool } from "@modsmith/core";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/marketing/section";
import { GuideCard, guideCardSelect } from "@/components/marketing/guide-card";
import { ToolIcon } from "@/components/marketing/tool-icon";
import { JsonLd } from "@/components/marketing/json-ld";
import { renderMarkdown } from "@/components/marketing/markdown";
import { siteUrl } from "@/components/marketing/data";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ category: string; slug: string }> };
type Faq = { question: string; answer: string };

async function load(category: string, slug: string) {
  const g = await prisma.guide.findFirst({ where: { slug, state: "PUBLISHED", category: { slug: category } }, include: { category: true, author: { select: { username: true } } } });
  return g;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, slug } = await params;
  const g = await load(category, slug);
  if (!g) return { title: "Guide not found" };
  const title = g.seoTitle || g.title;
  const description = g.seoDescription || g.intro;
  return { title, description, alternates: { canonical: `/guides/${g.category.slug}/${g.slug}` }, openGraph: { title, description, type: "article", url: `/guides/${g.category.slug}/${g.slug}`, publishedTime: g.publishedAt?.toISOString(), modifiedTime: g.updatedAt.toISOString() } };
}

export default async function GuidePage({ params }: Params) {
  const { category, slug } = await params;
  const g = await load(category, slug);
  if (!g) notFound();
  const { html, toc } = renderMarkdown(g.content);
  const faqs = (Array.isArray(g.faqs) ? (g.faqs as unknown[]) : []).filter((f): f is Faq => !!f && typeof f === "object" && typeof (f as Faq).question === "string" && typeof (f as Faq).answer === "string");
  const related = g.relatedSlugs.length ? await prisma.guide.findMany({ where: { slug: { in: g.relatedSlugs }, state: "PUBLISHED" }, select: guideCardSelect }) : [];
  const tool = g.toolSlug ? getTool(g.toolSlug) : null;
  const base = siteUrl();
  const url = `${base}/guides/${g.category.slug}/${g.slug}`;

  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.seoDescription || g.intro, url, datePublished: g.publishedAt?.toISOString(), dateModified: g.updatedAt.toISOString(), author: { "@type": g.author ? "Person" : "Organization", name: g.author?.username ?? BRAND.name }, publisher: { "@type": "Organization", name: BRAND.name, url: base }, mainEntityOfPage: url, articleSection: g.category.name }} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Guides", item: `${base}/guides` }, { "@type": "ListItem", position: 2, name: g.category.name, item: `${base}/guides/${g.category.slug}` }, { "@type": "ListItem", position: 3, name: g.title, item: url }] }} />
      {faqs.length ? <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) }} /> : null}

      <div className="border-b border-border bg-bg-elevated/40">
        <Container className="py-10 sm:py-14">
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-fg-muted">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li><Link href="/guides" className="hover:text-fg">Guides</Link></li>
              <li aria-hidden>/</li>
              <li><Link href={`/guides/${g.category.slug}`} className="hover:text-fg">{g.category.name}</Link></li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-fg">{g.title}</li>
            </ol>
          </nav>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{g.title}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-fg-muted">{g.intro}</p>
          <p className="mt-4 text-xs text-fg-subtle">
            {g.publishedAt ? <>Published <time dateTime={g.publishedAt.toISOString()}>{formatDate(g.publishedAt)}</time></> : null}
            {g.updatedAt && g.publishedAt && g.updatedAt.getTime() - g.publishedAt.getTime() > 86400_000 ? <> · Updated <time dateTime={g.updatedAt.toISOString()}>{formatDate(g.updatedAt)}</time></> : null}
            {g.author ? <> · by @{g.author.username}</> : null}
          </p>
        </Container>
      </div>

      <Container className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <article className="min-w-0">
          <div className="prose-dark max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
          {faqs.length ? (
            <section className="mt-12" aria-labelledby="faq-heading">
              <h2 id="faq-heading" className="text-xl font-semibold text-fg">Frequently asked questions</h2>
              <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-bg-elevated">
                {faqs.map((f, i) => (
                  <details key={i} className="group px-5 py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
                      {f.question}
                      <ChevronDown className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <p className="mt-3 text-sm leading-6 text-fg-muted">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
          {tool ? (
            <aside className="mt-12 flex flex-col gap-4 rounded-lg border border-accent/40 bg-accent-soft/40 p-6 sm:flex-row sm:items-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-accent/40 bg-bg text-accent"><ToolIcon name={tool.icon} className="h-5 w-5" /></span>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-fg">Try it in the {tool.name}</h2>
                <p className="mt-1 text-sm text-fg-muted">{tool.description}</p>
              </div>
              <Button asChild><Link href={tool.href}>Open {tool.name} <ArrowRight /></Link></Button>
            </aside>
          ) : null}
          {related.length ? (
            <section className="mt-12" aria-labelledby="related-heading">
              <h2 id="related-heading" className="text-xl font-semibold text-fg">Related guides</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {related.map((r) => <GuideCard key={r.slug} g={r} />)}
              </div>
            </section>
          ) : null}
        </article>
        <aside className="order-first lg:order-none">
          {toc.length ? (
            <nav aria-label="On this page" className="rounded-lg border border-border bg-bg-elevated p-4 lg:sticky lg:top-24">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">On this page</h2>
              <ol className="mt-3 space-y-1.5 text-sm">
                {toc.map((t) => (
                  <li key={t.id} className={t.level === 3 ? "pl-3" : ""}>
                    <a href={`#${t.id}`} className="block text-fg-muted hover:text-fg">{t.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
        </aside>
      </Container>
    </>
  );
}
