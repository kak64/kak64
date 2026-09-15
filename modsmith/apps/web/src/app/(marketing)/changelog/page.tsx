import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { prisma } from "@modsmith/db";
import { getTool } from "@modsmith/core";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Container, PageIntro } from "@/components/marketing/section";
import { ToolIcon } from "@/components/marketing/tool-icon";
import { renderMarkdown } from "@/components/marketing/markdown";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Every release of Modsmith: new tools, improvements and fixes for the browser-based FiveM asset workshop.",
  alternates: { canonical: "/changelog" },
  openGraph: { title: "Changelog · Modsmith", description: "New tools, improvements and fixes, release by release.", url: "/changelog" },
};

const CATEGORY_VARIANT: Record<string, BadgeProps["variant"]> = { feature: "accent", improvement: "info", fix: "success", tool: "warning" };

export default async function ChangelogPage() {
  const entries = await prisma.changelogEntry.findMany({ where: { state: "PUBLISHED" }, orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }] });
  const groups = new Map<string, { label: string; entries: typeof entries }>();
  for (const e of entries) {
    const d = e.publishedAt ?? e.createdAt;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, { label: formatDate(d, { month: "long", year: "numeric" }), entries: [] });
    groups.get(key)!.entries.push(e);
  }

  return (
    <>
      <PageIntro eyebrow="Changelog" title="What we shipped" description="Modsmith is built in the open. New tools, improvements and fixes land here as they go live — this page doubles as our status history." />
      <Container className="py-12">
        {entries.length ? (
          <div className="space-y-12">
            {[...groups.entries()].map(([key, g]) => (
              <section key={key} aria-labelledby={`month-${key}`}>
                <h2 id={`month-${key}`} className="sticky top-16 z-10 -mx-1 bg-bg/90 px-1 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-fg-subtle backdrop-blur">{g.label}</h2>
                <ol className="mt-4 space-y-4">
                  {g.entries.map((e) => {
                    const tool = e.toolSlug ? getTool(e.toolSlug) : null;
                    const { html } = renderMarkdown(e.description);
                    const date = e.publishedAt ?? e.createdAt;
                    return (
                      <li key={e.id} className="rounded-lg border border-border bg-bg-elevated p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md border border-border bg-bg-muted px-2 py-0.5 font-mono text-xs text-fg">v{e.version}</span>
                          <Badge variant={CATEGORY_VARIANT[e.category] ?? "default"} className="capitalize">{e.category}</Badge>
                          {tool ? (
                            <Link href={tool.href} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-muted hover:text-fg">
                              <ToolIcon name={tool.icon} className="h-3 w-3 text-accent" /> {tool.name}
                            </Link>
                          ) : null}
                          <time dateTime={date.toISOString()} className="ml-auto text-xs text-fg-subtle">{formatDate(date)}</time>
                        </div>
                        <h3 className="mt-3 text-base font-semibold text-fg">{e.title}</h3>
                        <div className="prose-dark mt-1 max-w-none text-sm [&_p]:my-2" dangerouslySetInnerHTML={{ __html: html }} />
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState icon={History} title="No releases published yet" description="Release notes will appear here as soon as the first version ships." />
        )}
      </Container>
    </>
  );
}
