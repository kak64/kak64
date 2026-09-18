import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import { prisma } from "@modsmith/db";
import { TOOLS } from "@modsmith/core";
import { getCurrentUser } from "@/server/session";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ReviewForm, type ReviewOption } from "@/components/app/reviews/review-form";

export const metadata: Metadata = { title: "Write a review" };
export const dynamic = "force-dynamic";

export default async function NewReviewPage() {
  const user = (await getCurrentUser())!;
  const [completed, creations, existing] = await Promise.all([
    prisma.processingJob.count({ where: { userId: user.id, status: "COMPLETED" } }),
    prisma.creation.findMany({ where: { userId: user.id, deletedAt: null, status: "READY" }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, name: true } }),
    prisma.review.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, rating: true, status: true, createdAt: true, text: true } }),
  ]);

  if (completed === 0) {
    return (
      <div>
        <PageHeader title="Write a review" />
        <EmptyState icon={Star} title="Build something first" description="Reviews come from creators who have actually shipped an asset, so you can leave one as soon as your first export completes successfully. It usually takes a couple of minutes." action={{ label: "Browse tools", href: "/app/tools" }} />
      </div>
    );
  }

  const creationOptions: ReviewOption[] = creations.map((c) => ({ value: c.id, label: c.name }));
  const toolOptions: ReviewOption[] = TOOLS.map((t) => ({ value: t.slug, label: t.name }));

  return (
    <div>
      <PageHeader title="Write a review" description="Tell other creators what Modsmith is like to work with." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardContent className="pt-5"><ReviewForm creations={creationOptions} tools={toolOptions} /></CardContent></Card>
        <Card>
          <CardHeader><CardTitle>Your reviews</CardTitle></CardHeader>
          <CardContent>
            {existing.length ? (
              <ul className="space-y-3">
                {existing.map((r) => (
                  <li key={r.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-0.5" aria-label={`${r.rating} out of 5`}>{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={i < r.rating ? "h-3.5 w-3.5 fill-accent text-accent" : "h-3.5 w-3.5 text-border-strong"} aria-hidden />)}</span>
                      <Badge variant={r.status === "APPROVED" ? "success" : r.status === "REJECTED" ? "danger" : "default"}>{r.status.toLowerCase()}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-3 text-sm text-fg-muted">{r.text}</p>
                    <p className="mt-1 text-xs text-fg-subtle">{formatDate(r.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-fg-muted">You haven't written a review yet. Approved reviews appear on the <Link href="/reviews" className="text-accent hover:underline">public reviews page</Link>.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
