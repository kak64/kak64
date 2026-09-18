"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CREDITS, TOOL_BY_SLUG } from "@modsmith/core";
import { api, ApiClientError } from "@/lib/api-client";
import { formatCredits, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/form";
import { NativeSelect } from "@/components/ui/select";
import { Alert } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UploadZone } from "@/components/shared/upload-zone";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/components/ui/toast";
import { ApiErrorAlert } from "../api-error-alert";
import { useApiAction } from "../hooks";
import { SHOWCASE_CATEGORIES, type CreationRow } from "./types";

type DialogProps = { creation: CreationRow; open: boolean; onOpenChange: (o: boolean) => void };

export function RenameDialog({ creation, open, onOpenChange }: DialogProps) {
  const [name, setName] = React.useState(creation.name);
  const { run, isBusy } = useApiAction();
  React.useEffect(() => { if (open) setName(creation.name); }, [open, creation.name]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const r = await run("rename", () => api(`/api/v1/creations/${creation.id}`, { method: "PATCH", json: { name: name.trim() } }), { success: "Renamed", refresh: true });
    if (r !== undefined) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader><DialogTitle>Rename creation</DialogTitle><DialogDescription>Only the display name changes; the exported resource name stays the same.</DialogDescription></DialogHeader>
          <Field label="Name" htmlFor="rename-name"><Input id="rename-name" value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={isBusy("rename")} disabled={!name.trim()}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDialog({ creation, open, onOpenChange, afterDelete }: DialogProps & { afterDelete?: () => void }) {
  const router = useRouter();
  const { run, isBusy } = useApiAction();
  const del = async () => {
    const r = await run("delete", () => api(`/api/v1/creations/${creation.id}`, { method: "DELETE" }), { success: "Creation deleted" });
    if (r !== undefined) { onOpenChange(false); if (afterDelete) afterDelete(); else router.refresh(); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Delete "{creation.name}"?</DialogTitle><DialogDescription>All exported versions are removed from storage and any showcase listing is taken down. This cannot be undone.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="destructive" loading={isBusy("delete")} onClick={del}>Delete</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReexportDialog({ creation, open, onOpenChange }: DialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const tool = TOOL_BY_SLUG[creation.toolSlug];
  const upload = useUpload(creation.toolSlug);
  const [error, setError] = React.useState<unknown>(null);
  const [busy, setBusy] = React.useState(false);
  const noUploadTools = ["chain-creator", "ai-prop-creator"];
  const needsUpload = !noUploadTools.includes(creation.toolSlug);
  const freeUntil = creation.reexportUntil && new Date(creation.reexportUntil) > new Date() ? creation.reexportUntil : null;
  React.useEffect(() => { if (!open) { upload.reset(); setError(null); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const start = async () => {
    setBusy(true); setError(null);
    try {
      const job = await api<{ id: string; chargedCredits: number | null; isFreeReexport: boolean }>(`/api/v1/creations/${creation.id}/reexport`, { json: { uploadIds: upload.uploadIds } });
      toast({ title: job.isFreeReexport ? "Free re-export started" : "Re-export started", description: job.isFreeReexport ? "No credits charged." : `${formatCredits(job.chargedCredits)} credits held until the build completes.`, variant: "success" });
      onOpenChange(false);
      router.push(`/app/jobs/${job.id}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) { router.push("/login"); return; }
      setError(err);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Re-export "{creation.name}"</DialogTitle>
          <DialogDescription>Source files are deleted after a successful build, so upload the same file again. If the file is unchanged and the settings match, the re-export is free within {CREDITS.REEXPORT_WINDOW_DAYS} days of the last build.</DialogDescription>
        </DialogHeader>
        {freeUntil ? <Alert variant="success" title={`Free re-export until ${formatDate(freeUntil)}`}>Upload the identical file to rebuild at no cost. A changed file or different settings costs {formatCredits(tool?.creditCost ?? 0)} credits.</Alert> : <Alert variant="info">The free re-export window has passed. This rebuild costs {formatCredits(tool?.creditCost ?? 0)} credits, charged only if the build succeeds.</Alert>}
        {needsUpload ? (
          <UploadZone accept={tool?.accepts ?? []} items={upload.items} onFiles={upload.add} onCancel={upload.cancel} onRetry={upload.retry} onRemove={upload.remove} hint={creation.originalFilename ? `Original file: ${creation.originalFilename}` : undefined} />
        ) : <p className="text-sm text-fg-muted">This tool does not need a source upload. The saved settings are reused.</p>}
        <ApiErrorAlert error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={busy} disabled={upload.busy || (needsUpload && upload.uploadIds.length === 0)} onClick={start}>Start re-export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PublishDialog({ creation, open, onOpenChange }: DialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const initial = creation.showcase;
  const [form, setForm] = React.useState({ title: initial?.title ?? creation.name, description: initial?.description ?? "", category: (initial?.category as string) ?? "other", tags: (initial?.tags ?? []).join(", "), allowDownload: initial?.allowDownload ?? false, allowRemix: initial?.allowRemix ?? false });
  const [error, setError] = React.useState<unknown>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ url: string } | null>(null);
  React.useEffect(() => { if (open) { setResult(null); setError(null); } }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const tags = form.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
      const r = await api<{ slug: string; url: string }>(`/api/v1/creations/${creation.id}/publish`, { json: { title: form.title.trim(), description: form.description.trim() || undefined, category: form.category, tags, allowDownload: form.allowDownload, allowRemix: form.allowRemix } });
      setResult(r);
      toast({ title: initial ? "Showcase updated" : "Published to the showcase", variant: "success" });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) { router.push("/login"); return; }
      setError(err);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {result ? (
          <div className="space-y-4">
            <DialogHeader><DialogTitle>It's live</DialogTitle><DialogDescription>Your creation is now visible in the public showcase.</DialogDescription></DialogHeader>
            <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button asChild><Link href={result.url}>View public page</Link></Button></DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader><DialogTitle>{initial ? "Edit showcase listing" : "Publish to showcase"}</DialogTitle><DialogDescription>Share your work with the community. You can unpublish at any time.</DialogDescription></DialogHeader>
            {creation.status !== "READY" ? <Alert variant="warning">Only completed creations can be published. Export this creation first.</Alert> : null}
            <Field label="Title" htmlFor="pub-title"><Input id="pub-title" value={form.title} minLength={3} maxLength={80} required onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Description" htmlFor="pub-desc" hint="Optional, up to 2000 characters."><Textarea id="pub-desc" value={form.description} maxLength={2000} rows={4} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="pub-cat"><NativeSelect id="pub-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{SHOWCASE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect></Field>
              <Field label="Tags" htmlFor="pub-tags" hint="Comma separated, up to 10."><Input id="pub-tags" value={form.tags} placeholder="lowrider, neon, custom" onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2"><Checkbox id="pub-dl" checked={form.allowDownload} onCheckedChange={(v) => setForm({ ...form, allowDownload: v === true })} /><Label htmlFor="pub-dl" className="font-normal">Allow others to download the resource</Label></div>
              <div className="flex items-center gap-2"><Checkbox id="pub-remix" checked={form.allowRemix} onCheckedChange={(v) => setForm({ ...form, allowRemix: v === true })} /><Label htmlFor="pub-remix" className="font-normal">Allow remixing in Modsmith tools</Label></div>
            </div>
            <ApiErrorAlert error={error} />
            <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={busy} disabled={creation.status !== "READY"}>{initial ? "Save changes" : "Publish"}</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function UnpublishDialog({ creation, open, onOpenChange }: DialogProps) {
  const { run, isBusy } = useApiAction();
  const go = async () => {
    const r = await run("unpublish", () => api(`/api/v1/creations/${creation.id}/unpublish`, { method: "POST" }), { success: "Removed from the showcase", refresh: true });
    if (r !== undefined) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Unpublish "{creation.name}"?</DialogTitle><DialogDescription>The public page will be hidden. Likes and views are kept if you publish again.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={isBusy("unpublish")} onClick={go}>Unpublish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
