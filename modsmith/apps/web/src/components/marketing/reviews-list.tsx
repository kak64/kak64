"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { ReviewCard, type ReviewCardItem } from "./review-card";

type Page = { total: number; page: number; pageSize: number; reviews: ReviewCardItem[] };

export function ReviewsList({ initial, total, pageSize }: { initial: ReviewCardItem[]; total: number; pageSize: number }) {
  const [items, setItems] = React.useState(initial);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();
  const hasMore = items.length < total;
  const more = async () => {
    setLoading(true);
    try {
      const next = page + 1;
      const res = await api<Page>(`/api/v1/reviews?page=${next}&pageSize=${pageSize}`);
      setItems((prev) => { const seen = new Set(prev.map((r) => r.id)); return [...prev, ...res.reviews.filter((r) => !seen.has(r.id))]; });
      setPage(next);
    } catch (err) {
      toast({ title: "Could not load more reviews", description: err instanceof Error ? err.message : undefined, variant: "danger" });
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-live="polite">
        {items.map((r) => <li key={r.id}><ReviewCard review={r} /></li>)}
      </ul>
      {hasMore ? (
        <div className="mt-8 flex justify-center">
          <Button variant="outline" onClick={more} loading={loading}>Show more</Button>
        </div>
      ) : null}
    </div>
  );
}
