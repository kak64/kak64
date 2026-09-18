"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Flag, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

function useLoginRedirect(slug: string) {
  const router = useRouter();
  return React.useCallback(() => router.push(`/login?next=${encodeURIComponent(`/showcase/${slug}`)}`), [router, slug]);
}

export function LikeButton({ slug, initialCount, loggedIn }: { slug: string; initialCount: number; loggedIn: boolean }) {
  const [count, setCount] = React.useState(initialCount);
  const [liked, setLiked] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();
  const toLogin = useLoginRedirect(slug);
  const onClick = async () => {
    if (!loggedIn) return toLogin();
    setLoading(true);
    try {
      const res = await api<{ liked: boolean; likeCount: number }>(`/api/v1/showcase/${encodeURIComponent(slug)}/like`, { method: "POST" });
      setLiked(res.liked);
      setCount(Math.max(0, res.likeCount));
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return toLogin();
      toast({ title: "Could not update like", description: err instanceof Error ? err.message : undefined, variant: "danger" });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button variant={liked ? "default" : "outline"} onClick={onClick} loading={loading} aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"}>
      <Heart className={cn(liked && "fill-current")} /> {count.toLocaleString("en-US")}
    </Button>
  );
}

export function DownloadButton({ slug, loggedIn }: { slug: string; loggedIn: boolean }) {
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();
  const toLogin = useLoginRedirect(slug);
  const onClick = async () => {
    if (!loggedIn) return toLogin();
    setLoading(true);
    try {
      const res = await api<{ url: string; fileName: string }>(`/api/v1/showcase/${encodeURIComponent(slug)}/download`);
      window.location.assign(res.url);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return toLogin();
      toast({ title: "Download unavailable", description: err instanceof Error ? err.message : undefined, variant: "danger" });
    } finally {
      setLoading(false);
    }
  };
  return <Button onClick={onClick} loading={loading}><Download /> Download resource</Button>;
}

const REASONS = [
  { value: "copyright", label: "Copyright or stolen asset" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "spam", label: "Spam or misleading" },
  { value: "other", label: "Something else" },
] as const;

export function ReportDialog({ slug, loggedIn }: { slug: string; loggedIn: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<(typeof REASONS)[number]["value"]>("copyright");
  const [details, setDetails] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();
  const toLogin = useLoginRedirect(slug);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedIn) return toLogin();
    setLoading(true);
    try {
      await api(`/api/v1/showcase/${encodeURIComponent(slug)}/report`, { json: { reason, details: details.trim() || undefined } });
      toast({ title: "Report submitted", description: "Thanks — a moderator will review it.", variant: "success" });
      setOpen(false);
      setDetails("");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return toLogin();
      toast({ title: "Could not submit report", description: err instanceof Error ? err.message : undefined, variant: "danger" });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><Flag /> Report</Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Report this creation</DialogTitle>
            <DialogDescription>Reports are reviewed by moderators. Copyright complaints can also be sent by email — see our Terms.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="report-reason">Reason</Label>
            <NativeSelect id="report-reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="report-details">Details <span className="font-normal text-fg-subtle">(optional)</span></Label>
            <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} placeholder="Links to the original work, what is wrong, anything that helps us act quickly." />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={loading}>{loggedIn ? "Submit report" : "Log in to report"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Fires a single view ping on mount. Renders nothing. */
export function ViewPing({ slug }: { slug: string }) {
  React.useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/v1/showcase/${encodeURIComponent(slug)}/view`, { method: "POST", credentials: "same-origin", signal: ctrl.signal, headers: { "x-csrf-token": document.cookie.match(/(?:^|; )ms_csrf=([^;]+)/)?.[1] ?? "" } }).catch(() => {});
    return () => ctrl.abort();
  }, [slug]);
  return null;
}
