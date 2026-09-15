import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { prisma } from "@modsmith/db";
import { EmptyState } from "@/components/ui/misc";
import { Container, PageIntro, SectionHeading } from "@/components/marketing/section";
import { GuideCard, guideCardSelect } from "@/components/marketing/guide-card";
import { ToolIcon } from "@/components/marketing/tool-icon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Guides",
  description: "Practical guides for FiveM asset creation: props, vehicles, liveries, clothing, weapons, tattoos, optimization, file formats and troubleshooting.",
  alternates: { canonical: "/guides" },
  openGraph: { title: "Guides · Modsmith", url: "/guides" },
};

export default async function GuidesPage() {
  const [categories, latest] = await Promise.all([
    prisma.guideCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { guides: { where: { state: "PUBLISHED" } } } } } }),
    prisma.guide.findMany({ where: { state: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 6, select: guideCardSelect }),
  ]);
  const visible = categories.filter((c) => c._count.guides > 0);
  return (
    <>
      <PageIntro eyebrow="Guides" title="Learn the pipeline, not the plugins" description="Short, practical articles about how FiveM assets actually work and how to build them in the browser. Written by the people who built the tools." />
      <Container className="py-10">
        <SectionHeading title="Browse by topic" className="mb-6" />
        {visible.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((c) => (
              <li key={c.slug}>
                <Link href={`/guides/${c.slug}`} className="flex h-full items-start gap-3 rounded-lg border border-border bg-bg-elevated p-4 transition-colors hover:border-border-strong">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-bg-muted text-accent"><ToolIcon name={c.icon} className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg">{c.name} <span className="font-normal text-fg-subtle">· {c._count.guides}</span></span>
                    {c.description ? <span className="mt-0.5 block text-xs leading-5 text-fg-muted">{c.description}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={BookOpen} title="Guides are being written" description="Check back soon, or ask in the Discord." />
        )}
        {latest.length ? (
          <>
            <SectionHeading title="Latest guides" className="mb-6 mt-14" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {latest.map((g) => <GuideCard key={g.slug} g={g} />)}
            </div>
          </>
        ) : null}
      </Container>
    </>
  );
}
