import type { Metadata } from "next";
import Link from "next/link";
import { PenLine, Star } from "lucide-react";
import { prisma } from "@modsmith/db";
import { BRAND } from "@modsmith/core";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Container, PageIntro } from "@/components/marketing/section";
import { Stars } from "@/components/marketing/review-card";
import { ReviewsList } from "@/components/marketing/reviews-list";
import { JsonLd } from "@/components/marketing/json-ld";
import { siteUrl } from "@/components/marketing/data";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 12;

export const metadata: Metadata = {
  title: "Reviews",
  description: "Honest reviews from FiveM creators who export with Modsmith. Every review is written after a completed export and approved before it is shown.",
  alternates: { canonical: "/reviews" },
  openGraph: { title: "Reviews · Modsmith", url: "/reviews" },
};

export default async function ReviewsPage() {
  const where = { status: "APPROVED" as const };
  const [total, reviews, agg, dist] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE_SIZE, include: { user: { select: { username: true, avatarUrl: true } } } }),
    prisma.review.aggregate({ where, _avg: { rating: true } }),
    prisma.review.groupBy({ by: ["rating"], where, _count: { _all: true } }),
  ]);
  const average = agg._avg.rating ?? 0;
  const counts = new Map(dist.map((d) => [d.rating, d._count._all]));
  const items = reviews.map((r) => ({ id: r.id, rating: r.rating, text: r.text, toolSlug: r.toolSlug, createdAt: r.createdAt.toISOString(), user: r.user }));

  return (
    <>
      {total > 0 ? <JsonLd data={{ "@context": "https://schema.org", "@type": "Product", name: BRAND.name, url: siteUrl(), aggregateRating: { "@type": "AggregateRating", ratingValue: average.toFixed(1), reviewCount: total, bestRating: 5, worstRating: 1 } }} /> : null}
      <PageIntro eyebrow="Reviews" title="What creators say about Modsmith" description="Reviews can only be written by accounts with at least one completed export, and each one is checked by a moderator before it appears.">
        <Button asChild><Link href="/app/reviews/new"><PenLine /> Write a review</Link></Button>
      </PageIntro>
      <Container className="py-10">
        <div className="mb-10 grid gap-4 rounded-lg border border-border bg-bg-elevated p-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="text-center sm:pr-8 sm:text-left">
            <div className="text-5xl font-semibold tabular-nums text-fg">{total ? average.toFixed(1) : "—"}</div>
            <Stars rating={average} size="lg" className="mt-2" />
            <div className="mt-1 text-xs text-fg-subtle">{total.toLocaleString("en-US")} approved {total === 1 ? "review" : "reviews"}</div>
          </div>
          <dl className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((r) => {
              const c = counts.get(r) ?? 0;
              const pct = total ? Math.round((c / total) * 100) : 0;
              return (
                <div key={r} className="flex items-center gap-3 text-xs">
                  <dt className="w-12 shrink-0 text-fg-muted">{r} star{r === 1 ? "" : "s"}</dt>
                  <dd className="flex flex-1 items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-subtle" role="img" aria-label={`${pct}% of reviews are ${r} stars`}><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
                    <span className="w-10 text-right tabular-nums text-fg-subtle">{c}</span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
        {items.length ? (
          <ReviewsList initial={items} total={total} pageSize={PAGE_SIZE} />
        ) : (
          <EmptyState icon={Star} title="Reviews from creators will appear here once approved" description="We do not seed or buy reviews. Complete an export, then tell us how it went." action={{ label: "Write a review", href: "/app/reviews/new" }} />
        )}
      </Container>
    </>
  );
}
