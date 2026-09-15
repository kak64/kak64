"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { api, ApiClientError, fieldErrors } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Field } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { ApiErrorAlert } from "../api-error-alert";

export interface ReviewOption { value: string; label: string }

const LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = React.useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label="Rating" className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? "" : "s"}`}
            className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onMouseEnter={() => setHover(n)} onClick={() => onChange(n)}
            onKeyDown={(e) => { if (e.key === "ArrowRight") onChange(Math.min(5, value + 1)); if (e.key === "ArrowLeft") onChange(Math.max(1, value - 1)); }}>
            <Star className={cn("h-7 w-7 transition-colors", n <= shown ? "fill-accent text-accent" : "text-border-strong")} aria-hidden />
          </button>
        ))}
      </div>
      <span className="text-sm text-fg-muted">{LABELS[shown] ?? ""}</span>
    </div>
  );
}

export function ReviewForm({ creations, tools }: { creations: ReviewOption[]; tools: ReviewOption[] }) {
  const router = useRouter();
  const [rating, setRating] = React.useState(5);
  const [text, setText] = React.useState("");
  const [creationId, setCreationId] = React.useState("");
  const [toolSlug, setToolSlug] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<unknown>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setErrors({});
    if (text.trim().length < 10) { setErrors({ text: "Write at least 10 characters" }); return; }
    setBusy(true);
    try {
      await api("/api/v1/reviews", { json: { rating, text: text.trim(), creationId: creationId || undefined, toolSlug: toolSlug || undefined } });
      setDone(true);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) { router.push("/login"); return; }
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      setError(err);
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="space-y-4">
        <Alert variant="success" title="Thanks — your review is pending moderation">We read every review. Once approved it appears on the Modsmith site with your username.</Alert>
        <div className="flex gap-2"><Button asChild><Link href="/app">Back to dashboard</Link></Button><Button variant="outline" asChild><Link href="/app/showcase">My showcase</Link></Button></div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-5">
      <Field label="Your rating" htmlFor="rating" error={errors.rating}><StarPicker value={rating} onChange={setRating} /></Field>
      <Field label="Your review" htmlFor="review-text" error={errors.text} hint={`${text.trim().length}/1000 characters — 10 minimum.`}>
        <Textarea id="review-text" rows={6} maxLength={1000} value={text} invalid={!!errors.text} onChange={(e) => setText(e.target.value)} placeholder="What did you build, and how did it go?" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="About a creation" htmlFor="review-creation" hint="Optional.">
          <NativeSelect id="review-creation" value={creationId} onChange={(e) => setCreationId(e.target.value)}><option value="">No specific creation</option>{creations.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</NativeSelect>
        </Field>
        <Field label="About a tool" htmlFor="review-tool" hint="Optional.">
          <NativeSelect id="review-tool" value={toolSlug} onChange={(e) => setToolSlug(e.target.value)}><option value="">Modsmith overall</option>{tools.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</NativeSelect>
        </Field>
      </div>
      <ApiErrorAlert error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy}>Submit review</Button>
        <p className="text-xs text-fg-subtle">Reviews are moderated before they appear publicly.</p>
      </div>
    </form>
  );
}
