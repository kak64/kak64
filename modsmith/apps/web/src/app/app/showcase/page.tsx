import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Eye, Heart, Images, Star } from "lucide-react";
import { prisma } from "@modsmith/db";
import { TOOL_BY_SLUG } from "@modsmith/core";
import { storage } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { formatCredits, formatDate } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { CreationThumb } from "@/components/app/creations/creation-thumb";
import { ShowcaseItemActions } from "@/components/app/showcase/showcase-item-actions";
import type { CreationRow } from "@/components/app/creations/types";

export const metadata: Metadata = { title: "Showcase" };
export const dynamic = "force-dynamic";

export default async function MyShowcasePage() {
  const user = (await getCurrentUser())!;
  const items = await prisma.showcaseItem.findMany({
    where: { userId: user.id, status: { not: "REMOVED" } },
    orderBy: { publishedAt: "desc" },
    include: { creation: { select: { id: true, name: true, toolSlug: true, status: true, originalFilename: true, exportVersion: true, lastCreditCost: true, reexportUntil: true, isPublic: true, thumbnailKey: true, createdAt: true, updatedAt: true } } },
  });
  const s = storage();
  const rows = await Promise.all(items.map(async (i) => ({
    item: i,
    thumbnailUrl: i.thumbnailKey ? await s.signedGetUrl(i.thumbnailKey, { ttl: 3600 }).catch(() => null) : null,
  })));
  const published = items.filter((i) => i.status === "PUBLISHED");
  const likes = items.reduce((a, i) => a + i.likeCount, 0);
  const views = items.reduce((a, i) => a + i.viewCount, 0);

  return (
    <div>
      <PageHeader title="Showcase" description="Your published creations, their reach and their listing settings." actions={<Button variant="outline" size="sm" asChild><Link href="/app/reviews/new"><Star /> Write a review</Link></Button>} />

      {items.length ? (
        <>
          <section className="mb-6 grid gap-3 sm:grid-cols-3">
            <Stat label="Published" value={`${published.length} / ${items.length}`} icon={Images} hint="Visible in the public showcase" />
            <Stat label="Total likes" value={formatCredits(likes)} icon={Heart} />
            <Stat label="Total views" value={formatCredits(views)} icon={Eye} />
          </section>
          <ul className="grid gap-4 lg:grid-cols-2">
            {rows.map(({ item, thumbnailUrl }) => {
              const c = item.creation;
              const row: CreationRow = {
                id: c.id, name: c.name, toolSlug: c.toolSlug, status: c.status, originalFilename: c.originalFilename, exportVersion: c.exportVersion, lastCreditCost: c.lastCreditCost,
                reexportUntil: c.reexportUntil?.toISOString() ?? null, isPublic: c.isPublic, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), thumbnailUrl,
                currentVersion: null, currentJob: null,
                showcase: { slug: item.slug, status: item.status, title: item.title, description: item.description, category: item.category, tags: item.tags, allowDownload: item.allowDownload, allowRemix: item.allowRemix },
              };
              return (
                <li key={item.id} className="flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-4 sm:flex-row">
                  <CreationThumb url={thumbnailUrl} toolSlug={item.toolSlug} name={item.title} className="h-28 w-full shrink-0 rounded-md sm:w-40" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold">{item.title}</h2>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-fg-muted">{TOOL_BY_SLUG[item.toolSlug]?.name ?? item.toolSlug} · {item.category} · published {formatDate(item.publishedAt)}</p>
                    {item.description ? <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{item.description}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                      <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" aria-hidden /> {formatCredits(item.likeCount)}</span>
                      <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" aria-hidden /> {formatCredits(item.viewCount)}</span>
                      {item.allowDownload ? <Badge variant="outline">downloads allowed</Badge> : null}
                      {item.allowRemix ? <Badge variant="outline">remix allowed</Badge> : null}
                      {item.featured ? <Badge variant="accent">featured</Badge> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {item.status === "PUBLISHED" ? <Button variant="outline" size="sm" asChild><Link href={`/showcase/${item.slug}`}><ExternalLink /> View public page</Link></Button> : null}
                      <Button variant="ghost" size="sm" asChild><Link href={`/app/creations/${c.id}`}>Open creation</Link></Button>
                      <ShowcaseItemActions creation={row} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <EmptyState icon={Images} title="Nothing published yet" description="Publish a finished creation to share it with the community, collect likes and let others download it if you want." action={{ label: "My Creations", href: "/app/creations" }} />
      )}
    </div>
  );
}
