import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, Heart, Lock, Unlock } from "lucide-react";
import { prisma } from "@modsmith/db";
import { BRAND, getTool } from "@modsmith/core";
import { getCurrentUser } from "@/server/session";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/marketing/section";
import { ShowcaseThumb } from "@/components/marketing/showcase-card";
import { DownloadButton, LikeButton, ReportDialog, ViewPing } from "@/components/marketing/showcase-actions";
import { JsonLd } from "@/components/marketing/json-ld";
import { signedOrNull, siteUrl } from "@/components/marketing/data";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  return prisma.showcaseItem.findFirst({ where: { slug, status: "PUBLISHED" }, include: { user: { select: { username: true, avatarUrl: true, profilePublic: true } } } });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const item = await load(slug);
  if (!item) return { title: "Creation not found" };
  const description = item.description?.slice(0, 160) || `${item.title} — a ${item.category} built with ${getTool(item.toolSlug)?.name ?? "Modsmith"} by @${item.user.username}.`;
  return {
    title: item.title,
    description,
    alternates: { canonical: `/showcase/${item.slug}` },
    openGraph: { title: item.title, description, url: `/showcase/${item.slug}`, type: "article" },
  };
}

export default async function ShowcaseDetailPage({ params }: Params) {
  const { slug } = await params;
  const [item, user] = await Promise.all([load(slug), getCurrentUser()]);
  if (!item) notFound();
  const tool = getTool(item.toolSlug);
  const [thumbnailUrl, screenshots] = await Promise.all([
    signedOrNull(item.thumbnailKey),
    Promise.all(item.screenshotKeys.slice(0, 8).map((k) => signedOrNull(k))),
  ]);
  const images = screenshots.filter((u): u is string => !!u);
  const loggedIn = !!user;
  const isOwner = user?.id === item.userId;

  return (
    <>
      <ViewPing slug={item.slug} />
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "CreativeWork", name: item.title, description: item.description ?? undefined, url: `${siteUrl()}/showcase/${item.slug}`,
        datePublished: item.publishedAt.toISOString(), dateModified: item.updatedAt.toISOString(), genre: item.category, keywords: item.tags.join(", ") || undefined,
        author: { "@type": "Person", name: item.user.username, url: item.user.profilePublic ? `${siteUrl()}/u/${item.user.username}` : undefined },
        publisher: { "@type": "Organization", name: BRAND.name }, image: thumbnailUrl ?? undefined,
        interactionStatistic: [
          { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: item.likeCount },
          { "@type": "InteractionCounter", interactionType: "https://schema.org/ViewAction", userInteractionCount: item.viewCount },
        ],
      }} />
      <Container className="py-8 sm:py-12">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-fg-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/showcase" className="hover:text-fg">Showcase</Link></li>
            <li aria-hidden>/</li>
            <li><Link href={`/showcase?category=${encodeURIComponent(item.category)}`} className="capitalize hover:text-fg">{item.category}</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="truncate text-fg">{item.title}</li>
          </ol>
        </nav>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <ShowcaseThumb item={{ slug: item.slug, title: item.title, toolSlug: item.toolSlug, category: item.category, thumbnailUrl }} className="aspect-[16/10] rounded-lg border border-border" priority />
            {images.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Screenshots">
                {images.map((src, i) => (
                  <li key={src} className="overflow-hidden rounded-md border border-border bg-bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                    <img src={src} alt={`${item.title} screenshot ${i + 1}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="rounded-lg border border-border bg-bg-elevated p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-subtle">About this creation</h2>
              {item.description ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-fg">{item.description}</p> : <p className="mt-3 text-sm text-fg-muted">The creator did not add a description.</p>}
              {item.tags.length ? (
                <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
                  {item.tags.map((t) => <li key={t}><Badge>#{t}</Badge></li>)}
                </ul>
              ) : null}
            </div>
          </div>
          <aside className="space-y-4">
            <div className="rounded-lg border border-border bg-bg-elevated p-5">
              <h1 className="text-xl font-semibold tracking-tight text-fg">{item.title}</h1>
              <div className="mt-3 flex items-center gap-3">
                <UserAvatar username={item.user.username} src={item.user.avatarUrl} />
                <div className="text-sm">
                  {item.user.profilePublic ? <Link href={`/u/${item.user.username}`} className="font-medium text-fg hover:text-accent">@{item.user.username}</Link> : <span className="font-medium text-fg">@{item.user.username}</span>}
                  <div className="text-xs text-fg-subtle">Published <time dateTime={item.publishedAt.toISOString()}>{formatDate(item.publishedAt)}</time></div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-fg-subtle">Tool</dt><dd className="text-fg">{tool ? <Link href={tool.href} className="hover:text-accent">{tool.name}</Link> : item.toolSlug}</dd></div>
                <div><dt className="text-xs text-fg-subtle">Category</dt><dd className="capitalize text-fg">{item.category}</dd></div>
                <div><dt className="text-xs text-fg-subtle">Likes</dt><dd className="inline-flex items-center gap-1 tabular-nums text-fg"><Heart className="h-3.5 w-3.5" aria-hidden /> {item.likeCount.toLocaleString("en-US")}</dd></div>
                <div><dt className="text-xs text-fg-subtle">Views</dt><dd className="inline-flex items-center gap-1 tabular-nums text-fg"><Eye className="h-3.5 w-3.5" aria-hidden /> {item.viewCount.toLocaleString("en-US")}</dd></div>
              </dl>
              <div className="mt-5 flex flex-col gap-2">
                {item.allowDownload || isOwner ? <DownloadButton slug={item.slug} loggedIn={loggedIn} /> : null}
                <div className="flex items-center gap-2">
                  <LikeButton slug={item.slug} initialCount={item.likeCount} loggedIn={loggedIn} />
                  <ReportDialog slug={item.slug} loggedIn={loggedIn} />
                </div>
              </div>
              <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-fg-subtle">
                {item.allowDownload ? <><Unlock className="h-3.5 w-3.5" aria-hidden /> Downloads enabled by the creator</> : <><Lock className="h-3.5 w-3.5" aria-hidden /> Downloads are disabled for this item</>}
              </p>
              {item.allowRemix ? <p className="mt-1 text-xs text-fg-subtle">Remixing allowed — credit the creator.</p> : null}
            </div>
            {tool ? (
              <div className="rounded-lg border border-border bg-bg-elevated p-5">
                <h2 className="text-sm font-semibold text-fg">Make your own with {tool.name}</h2>
                <p className="mt-1 text-sm text-fg-muted">{tool.description}</p>
                <Button asChild size="sm" className="mt-4 w-full"><Link href={loggedIn ? tool.href : "/register"}>{loggedIn ? "Open tool" : "Create free account"}</Link></Button>
              </div>
            ) : null}
          </aside>
        </div>
      </Container>
    </>
  );
}
