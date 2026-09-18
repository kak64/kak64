"use client";
/** Search Sketchfab for downloadable models and hand the imported upload back to the Prop Creator. */
import * as React from "react";
import { Eye, Heart, Search } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/select";
import { Alert, EmptyState, Spinner } from "@/components/ui/misc";
import { ApiErrorAlert } from "@/components/app/api-error-alert";
import { RIGHTS_STATEMENT } from "../tool-frame";
import type { JobDetail } from "../lib";

export interface SketchfabModel {
  id: string; name: string; author: string; authorUrl?: string; thumbnail?: string;
  likes: number; views: number; license: string; licenseUrl?: string; licenseSlug?: string;
  downloadable: boolean; faces?: number; vertices?: number; url: string;
}

export interface SketchfabImportResult {
  jobId: string;
  uploadId: string;
  attribution: { model: string; author: string; license: string; sourceUrl: string };
}

export function SketchfabDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (o: boolean) => void; onImported: (r: SketchfabImportResult) => void }) {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("relevance");
  const [results, setResults] = React.useState<SketchfabModel[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [picked, setPicked] = React.useState<SketchfabModel | null>(null);
  const [rights, setRights] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [stage, setStage] = React.useState<string | null>(null);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const r = await api<{ results: SketchfabModel[] }>(`/api/v1/external/sketchfab/search?q=${encodeURIComponent(q.trim())}&sort=${sort}`);
      setResults(r.results);
    } catch (err) {
      setError(err);
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const doImport = async () => {
    if (!picked) return;
    setImporting(true);
    setError(null);
    setStage("Queued");
    try {
      const { jobId } = await api<{ jobId: string }>("/api/v1/external/sketchfab/import", { json: { modelId: picked.id, rightsConfirmed: true } });
      const deadline = Date.now() + 10 * 60_000;
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        const detail = await api<JobDetail & { resultManifest: { facts?: { uploadId?: string } } | null }>(`/api/v1/jobs/${jobId}`);
        setStage(detail.stage ? detail.stage.replace(/_/g, " ") : detail.status.toLowerCase());
        if (detail.status === "COMPLETED") {
          const uploadId = (detail.resultManifest as { facts?: { uploadId?: string } } | null)?.facts?.uploadId;
          if (!uploadId) throw new Error("The import finished but returned no model file.");
          onImported({
            jobId,
            uploadId,
            attribution: { model: picked.name, author: picked.author, license: picked.license, sourceUrl: picked.url },
          });
          onOpenChange(false);
          return;
        }
        if (["FAILED", "CANCELLED", "REFUNDED"].includes(detail.status)) throw new Error(detail.errorMessage ?? "The import failed.");
        if (Date.now() > deadline) throw new Error("The import is taking unusually long — check your jobs list.");
      }
    } catch (err) {
      setError(err);
    } finally {
      setImporting(false);
      setStage(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setPicked(null); setRights(false); setError(null); } }}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Import from Sketchfab</DialogTitle>
          <DialogDescription>Only downloadable models are listed. Attribution is written into CREDITS.txt inside your exported resource.</DialogDescription>
        </DialogHeader>

        <form onSubmit={search} className="flex flex-wrap gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models — e.g. street barrier" className="min-w-40 flex-1" aria-label="Search Sketchfab" />
          <NativeSelect value={sort} onChange={(e) => setSort(e.target.value)} className="w-36" aria-label="Sort by">
            <option value="relevance">Relevance</option>
            <option value="likes">Most liked</option>
            <option value="views">Most viewed</option>
            <option value="recent">Newest</option>
          </NativeSelect>
          <Button type="submit" loading={searching}><Search /> Search</Button>
        </form>

        {error ? <ApiErrorAlert error={error} /> : null}

        {picked ? (
          <div className="space-y-3 rounded-lg border border-border bg-bg-muted p-3">
            <div className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote Sketchfab thumbnails */}
              {picked.thumbnail ? <img src={picked.thumbnail} alt="" className="h-20 w-28 rounded object-cover" /> : null}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{picked.name}</p>
                <p className="text-xs text-fg-muted">by {picked.author}</p>
                <p className="mt-1 text-xs text-fg-muted">{picked.license}{picked.licenseUrl ? <> · <a href={picked.licenseUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">licence terms</a></> : null}</p>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={rights} onCheckedChange={(v) => setRights(v === true)} className="mt-0.5" aria-label={RIGHTS_STATEMENT} />
              <span>I will respect this model&apos;s licence and keep the required attribution. {RIGHTS_STATEMENT}</span>
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setPicked(null)} disabled={importing}>Back to results</Button>
              <Button onClick={doImport} loading={importing} disabled={!rights}>{importing ? stage ?? "Importing…" : "Import model"}</Button>
            </div>
          </div>
        ) : searching ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-fg-muted"><Spinner /> Searching…</div>
        ) : results && results.length ? (
          <ul className="grid max-h-[50vh] grid-cols-2 gap-3 overflow-y-auto scrollbar-thin sm:grid-cols-3">
            {results.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setPicked(m)} className="w-full rounded-lg border border-border bg-bg-muted text-left transition-colors hover:border-accent">
                  <div className="aspect-video w-full overflow-hidden rounded-t-lg bg-bg-subtle">
                    {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote Sketchfab thumbnails */}
                    {m.thumbnail ? <img src={m.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="space-y-1 p-2">
                    <p className="truncate text-xs font-medium">{m.name}</p>
                    <p className="truncate text-[11px] text-fg-muted">{m.author}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-fg-subtle">
                      <span className="inline-flex items-center gap-0.5"><Heart className="h-3 w-3" />{m.likes}</span>
                      <span className="inline-flex items-center gap-0.5"><Eye className="h-3 w-3" />{m.views}</span>
                      {m.faces ? <span>{m.faces.toLocaleString("en-US")} tris</span> : null}
                    </div>
                    <Badge variant="outline" className="max-w-full truncate">{m.license}</Badge>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : results ? (
          <EmptyState title="No downloadable models found" description="Try a different search term or sort order." />
        ) : (
          <Alert variant="info">Search for a model to get started. Imports are free — you only pay when you export the finished prop.</Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
