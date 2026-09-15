import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, Eye, Heart, Images } from "lucide-react";
import { prisma } from "@modsmith/db";
import { UserAvatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { Container } from "@/components/marketing/section";
import { ShowcaseCard } from "@/components/marketing/showcase-card";
import { JsonLd } from "@/components/marketing/json-ld";
import { showcaseCardSelect, siteUrl, toShowcaseCards } from "@/components/marketing/data";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ username: string }> };

async function load(username: string) {
  const u = await prisma.user.findFirst({ where: { usernameNormalized: username.trim().toLowerCase(), status: "ACTIVE", deletedAt: null }, select: { id: true, username: true, avatarUrl: true, bio: true, profilePublic: true, createdAt: true } });
  return u && u.profilePublic ? u : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const u = await load(username);
  if (!u) return { title: "Profile not found", robots: { index: false } };
  return { title: `@${u.username}`, description: u.bio?.slice(0, 160) || `Public creations by @${u.username} on Modsmith.`, alternates: { canonical: `/u/${u.username}` }, openGraph: { title: `@${u.username} · Modsmith`, url: `/u/${u.username}`, type: "profile" } };
}

export default async function ProfilePage({ params }: Params) {
  const { username } = await params;
  const u = await load(username);
  if (!u) notFound();
  const [rows, agg] = await Promise.all([
    prisma.showcaseItem.findMany({ where: { userId: u.id, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 48, select: showcaseCardSelect }),
    prisma.showcaseItem.aggregate({ where: { userId: u.id, status: "PUBLISHED" }, _sum: { likeCount: true, viewCount: true }, _count: { _all: true } }),
  ]);
  const items = await toShowcaseCards(rows);
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "ProfilePage", mainEntity: { "@type": "Person", name: u.username, url: `${siteUrl()}/u/${u.username}`, description: u.bio ?? undefined, image: u.avatarUrl ?? undefined } }} />
      <div className="border-b border-border bg-bg-elevated/40">
        <Container className="flex flex-col gap-5 py-10 sm:flex-row sm:items-center">
          <UserAvatar username={u.username} src={u.avatarUrl} className="h-20 w-20 text-xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">@{u.username}</h1>
            {u.bio ? <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-muted">{u.bio}</p> : null}
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-subtle">
              <div className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">Joined</dt><dd>Joined {formatDate(u.createdAt, { month: "long", year: "numeric" })}</dd></div>
              <div className="inline-flex items-center gap-1.5"><Images className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">Creations</dt><dd>{agg._count._all.toLocaleString("en-US")} public creations</dd></div>
              <div className="inline-flex items-center gap-1.5"><Heart className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">Likes</dt><dd>{(agg._sum.likeCount ?? 0).toLocaleString("en-US")} likes</dd></div>
              <div className="inline-flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">Views</dt><dd>{(agg._sum.viewCount ?? 0).toLocaleString("en-US")} views</dd></div>
            </dl>
          </div>
        </Container>
      </div>
      <Container className="py-10">
        <h2 className="mb-4 text-lg font-semibold text-fg">Public creations</h2>
        {items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((i) => <ShowcaseCard key={i.slug} item={i} showCreator={false} />)}
          </div>
        ) : (
          <EmptyState icon={Images} title="Nothing published yet" description={`@${u.username} has not published any creations to the showcase.`} />
        )}
      </Container>
    </>
  );
}
