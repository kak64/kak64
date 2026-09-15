import { Star } from "lucide-react";
import { getTool } from "@modsmith/core";
import { UserAvatar } from "@/components/ui/avatar";
import { formatDate, cn } from "@/lib/utils";

export function Stars({ rating, className, size = "sm" }: { rating: number; className?: string; size?: "sm" | "lg" }) {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`${r} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5", i < r ? "fill-accent text-accent" : "text-border-strong")} aria-hidden />
      ))}
    </span>
  );
}

export type ReviewCardItem = { id: string; rating: number; text: string; toolSlug: string | null; createdAt: Date | string; user: { username: string; avatarUrl: string | null } };

export function ReviewCard({ review }: { review: ReviewCardItem }) {
  const tool = review.toolSlug ? getTool(review.toolSlug) : null;
  return (
    <figure className="flex h-full flex-col rounded-lg border border-border bg-bg-elevated p-5">
      <Stars rating={review.rating} />
      <blockquote className="mt-3 flex-1 text-sm leading-6 text-fg">“{review.text}”</blockquote>
      <figcaption className="mt-4 flex items-center gap-3 border-t border-border pt-4">
        <UserAvatar username={review.user.username} src={review.user.avatarUrl} />
        <div className="min-w-0 text-xs">
          <div className="truncate font-medium text-fg">@{review.user.username}</div>
          <div className="text-fg-subtle">{tool ? `${tool.name} · ` : ""}<time dateTime={new Date(review.createdAt).toISOString()}>{formatDate(review.createdAt)}</time></div>
        </div>
      </figcaption>
    </figure>
  );
}
