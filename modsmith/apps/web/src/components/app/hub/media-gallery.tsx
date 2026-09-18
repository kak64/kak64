"use client";
/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { Download, Film, Image as ImageIcon, Link2, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Alert, EmptyState, Spinner } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { copyText, errorMessage, useApiAction } from "../hooks";
import type { HubServerOption } from "./logs-explorer";

export interface MediaItem { id: string; kind: string; mime: string; sizeBytes: number; width: number | null; height: number | null; playerSource: number | null; playerLicense: string | null; playerDiscord: string | null; playerName: string | null; reason: string | null; reportId: string | null; createdAt: string; url: string }

const KINDS = [{ v: "", l: "All media" }, { v: "SCREENSHOT", l: "Screenshots" }, { v: "PHONE_PHOTO", l: "Phone photos" }, { v: "PHONE_VIDEO", l: "Phone video" }, { v: "OTHER", l: "Other" }];
const PAGE_SIZE = 24;

export function MediaGallery({ servers, initialServerId }: { servers: HubServerOption[]; initialServerId: string }) {
  const { toast } = useToast();
  const { run, isBusy } = useApiAction();
  const [serverId, setServerId] = React.useState(initialServerId);
  const [kind, setKind] = React.useState("");
  const [items, setItems] = React.useState<MediaItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<MediaItem | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<MediaItem | null>(null);

  const load = React.useCallback(async (p: number, append: boolean) => {
    if (!serverId) return;
    setLoading(true); setError(null);
    try {
      const sp = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (kind) sp.set("kind", kind);
      const r = await api<{ total: number; media: MediaItem[] }>(`/api/v1/server-hub/projects/${serverId}/media?${sp}`);
      setItems((prev) => (append ? [...prev, ...r.media] : r.media));
      setTotal(r.total); setPage(p);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [serverId, kind]);

  React.useEffect(() => { setItems([]); load(1, false); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, kind]);

  const copyTempLink = async (m: MediaItem) => {
    await run(`link-${m.id}`, async () => {
      const r = await api<{ url: string }>(`/api/v1/server-hub/media/${m.id}?ttl=600`);
      const ok = await copyText(r.url);
      toast(ok ? { title: "Temporary link copied", description: "The link works for 10 minutes.", variant: "success" } : { title: "Could not copy the link", variant: "danger" });
    });
  };
  const download = (m: MediaItem) => run(`dl-${m.id}`, async () => { const r = await api<{ url: string }>(`/api/v1/server-hub/media/${m.id}?download=1`); window.location.href = r.url; });
  const doDelete = async () => {
    if (!confirmDelete) return;
    const r = await run("delete", () => api(`/api/v1/server-hub/media/${confirmDelete.id}`, { method: "DELETE" }), { success: "Media deleted" });
    if (r !== undefined) { setItems((prev) => prev.filter((i) => i.id !== confirmDelete.id)); setTotal((t) => Math.max(0, t - 1)); setConfirmDelete(null); setActive(null); }
  };

  if (!servers.length) return <EmptyState icon={ImageIcon} title="No servers yet" description="Create a server to collect screenshots and phone media." action={{ label: "Server Hub", href: "/app/hub" }} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <NativeSelect aria-label="Server" value={serverId} onChange={(e) => setServerId(e.target.value)} className="sm:w-56">{servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
        <NativeSelect aria-label="Media kind" value={kind} onChange={(e) => setKind(e.target.value)} className="sm:w-48">{KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</NativeSelect>
        {total ? <span className="self-center text-sm text-fg-muted">{total} file{total === 1 ? "" : "s"}</span> : null}
      </div>

      {error ? <Alert variant="danger">{error}</Alert> : null}
      {loading && !items.length ? <div className="flex justify-center py-10"><Spinner /></div> : null}

      {!loading && !items.length && !error ? (
        <EmptyState icon={ImageIcon} title={kind ? "No media of this kind" : "No media yet"} description="Screenshots requested through msmhub and phone media uploads appear here. Files are private and only ever shared through short-lived links." action={{ label: "Setup instructions", href: `/app/hub/servers/${serverId}` }} />
      ) : null}

      {items.length ? (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setActive(m)} className="group block w-full overflow-hidden rounded-lg border border-border bg-bg-elevated text-left transition-colors hover:border-accent/50">
                  <div className="flex aspect-square items-center justify-center bg-bg-muted">
                    {m.mime.startsWith("image/") ? <img src={m.url} alt={m.reason ?? `${m.kind.toLowerCase()} from ${m.playerName ?? "a player"}`} className="h-full w-full object-cover" loading="lazy" /> : <Film className="h-8 w-8 text-fg-subtle" aria-hidden />}
                  </div>
                  <div className="p-2">
                    <div className="flex items-center justify-between gap-1"><Badge variant="default">{m.kind.replace("_", " ").toLowerCase()}</Badge><span className="text-[11px] text-fg-subtle">{formatBytes(m.sizeBytes)}</span></div>
                    <p className="mt-1 truncate text-xs text-fg-muted">{m.playerName ?? m.reason ?? formatDateTime(m.createdAt)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {items.length < total ? <div className="flex justify-center"><Button variant="outline" size="sm" loading={loading} onClick={() => load(page + 1, true)}>{loading ? <Loader2 className="animate-spin" /> : null} Load more</Button></div> : null}
        </>
      ) : null}

      <Dialog open={!!active} onOpenChange={(o) => { if (!o) setActive(null); }}>
        <DialogContent size="xl">
          {active ? (
            <>
              <DialogHeader><DialogTitle>{active.kind.replace("_", " ").toLowerCase()}</DialogTitle><DialogDescription>{active.reason ?? "No reason recorded"}</DialogDescription></DialogHeader>
              <div className="flex items-center justify-center rounded-md border border-border bg-bg-muted p-2">
                {active.mime.startsWith("image/") ? <img src={active.url} alt={active.reason ?? "Media preview"} className="max-h-[55vh] w-auto object-contain" /> : <video src={active.url} controls className="max-h-[55vh] w-auto" />}
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-2"><dt className="text-fg-muted">Player</dt><dd className="text-right">{active.playerName ?? "—"}{active.playerSource != null ? ` (src ${active.playerSource})` : ""}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-fg-muted">License</dt><dd className="truncate text-right font-mono text-xs">{active.playerLicense ?? "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-fg-muted">Discord</dt><dd className="truncate text-right font-mono text-xs">{active.playerDiscord ?? "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-fg-muted">Report</dt><dd className="text-right">{active.reportId ?? "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-fg-muted">Captured</dt><dd className="text-right">{formatDateTime(active.createdAt)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-fg-muted">File</dt><dd className="text-right">{formatBytes(active.sizeBytes)}{active.width && active.height ? ` · ${active.width}×${active.height}` : ""}</dd></div>
              </dl>
              <DialogFooter>
                <Button variant="ghost" className="text-danger sm:mr-auto" onClick={() => setConfirmDelete(active)}><Trash2 /> Delete</Button>
                <Button variant="outline" loading={isBusy(`link-${active.id}`)} onClick={() => copyTempLink(active)}><Link2 /> Copy temporary link</Button>
                <Button loading={isBusy(`dl-${active.id}`)} onClick={() => download(active)}><Download /> Download</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Delete this media?</DialogTitle><DialogDescription>The file is removed from storage and the space is freed. This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="destructive" loading={isBusy("delete")} onClick={doDelete}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
