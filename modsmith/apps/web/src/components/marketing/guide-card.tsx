import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTool } from "@modsmith/core";
import { formatDate } from "@/lib/utils";
import { ToolIcon } from "./tool-icon";

export type GuideCardItem = { slug: string; title: string; intro: string; toolSlug: string | null; publishedAt: Date | null; category: { slug: string; name: string; icon: string | null } };

export function GuideCard({ g }: { g: GuideCardItem }) {
  const tool = g.toolSlug ? getTool(g.toolSlug) : null;
  return (
    <article className="group flex h-full flex-col rounded-lg border border-border bg-bg-elevated p-5 transition-colors hover:border-border-strong">
      <div className="flex items-center gap-2 text-xs text-fg-subtle">
        <ToolIcon name={g.category.icon} className="h-3.5 w-3.5 text-accent" />
        <Link href={`/guides/${g.category.slug}`} className="hover:text-fg">{g.category.name}</Link>
        {g.publishedAt ? <><span aria-hidden>·</span><time dateTime={g.publishedAt.toISOString()}>{formatDate(g.publishedAt)}</time></> : null}
      </div>
      <h3 className="mt-3 text-base font-semibold text-fg"><Link href={`/guides/${g.category.slug}/${g.slug}`} className="hover:text-accent">{g.title}</Link></h3>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-fg-muted">{g.intro}</p>
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-fg-subtle">{tool ? `Uses ${tool.name}` : ""}</span>
        <Link href={`/guides/${g.category.slug}/${g.slug}`} className="inline-flex items-center gap-1 font-medium text-accent hover:underline" aria-label={`Read ${g.title}`}>Read <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></Link>
      </div>
    </article>
  );
}

export const guideCardSelect = { slug: true, title: true, intro: true, toolSlug: true, publishedAt: true, category: { select: { slug: true, name: true, icon: true } } } as const;
