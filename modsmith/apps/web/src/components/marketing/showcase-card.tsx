import Link from "next/link";
import { Eye, Heart } from "lucide-react";
import { getTool } from "@modsmith/core";
import { formatDate, cn } from "@/lib/utils";
import { ToolIcon } from "./tool-icon";

export type ShowcaseCardItem = {
  slug: string;
  title: string;
  category: string;
  toolSlug: string;
  likeCount: number;
  viewCount: number;
  publishedAt: Date | string;
  featured?: boolean;
  thumbnailUrl: string | null;
  creator?: { username: string } | null;
};

function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function ShowcaseThumb({ item, className, priority }: { item: Pick<ShowcaseCardItem, "slug" | "title" | "toolSlug" | "category" | "thumbnailUrl">; className?: string; priority?: boolean }) {
  const tool = getTool(item.toolSlug);
  const h = hue(item.slug);
  return (
    <div className={cn("relative aspect-[4/3] w-full overflow-hidden bg-bg-muted", className)}>
      {item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URLs from private storage; not optimizable
        <img src={item.thumbnailUrl} alt={item.title} loading={priority ? "eager" : "lazy"} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, hsl(${h} 30% 16%), hsl(${(h + 40) % 360} 35% 10%))` }} aria-hidden>
          <ToolIcon name={tool?.icon} className="h-10 w-10 text-fg-subtle" />
        </div>
      )}
    </div>
  );
}

export function ShowcaseCard({ item, showCreator = true }: { item: ShowcaseCardItem; showCreator?: boolean }) {
  const tool = getTool(item.toolSlug);
  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-bg-elevated transition-colors hover:border-border-strong">
      <Link href={`/showcase/${item.slug}`} className="block focus-visible:outline-none" aria-label={item.title}>
        <ShowcaseThumb item={item} />
      </Link>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-semibold text-fg"><Link href={`/showcase/${item.slug}`} className="hover:text-accent">{item.title}</Link></h3>
          {item.featured ? <span className="rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">Featured</span> : null}
        </div>
        <p className="mt-1 text-xs text-fg-muted">
          {showCreator && item.creator ? (<><Link href={`/u/${item.creator.username}`} className="hover:text-fg">@{item.creator.username}</Link> · </>) : null}
          {tool?.name ?? item.toolSlug} · <time dateTime={new Date(item.publishedAt).toISOString()}>{formatDate(item.publishedAt)}</time>
        </p>
        <div className="mt-3 flex items-center gap-4 text-xs text-fg-subtle">
          <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" aria-hidden /> {item.likeCount.toLocaleString("en-US")}<span className="sr-only"> likes</span></span>
          <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" aria-hidden /> {item.viewCount.toLocaleString("en-US")}<span className="sr-only"> views</span></span>
          <span className="ml-auto capitalize">{item.category}</span>
        </div>
      </div>
    </article>
  );
}
