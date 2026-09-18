"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Filter, Loader2, Search, Terminal, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/form";
import { Alert, EmptyState, Spinner } from "@/components/ui/misc";
import { errorMessage } from "../hooks";

export interface HubServerOption { id: string; name: string; datasets: string[] }
interface LogRow { id: string; timestamp: string; receivedAt: string; level: string; dataset: string; resource: string | null; message: string; metadata: unknown; player: { source: number | null; target: number | null; license: string | null; discord: string | null; name: string | null } }

const LEVELS = ["debug", "info", "warn", "error", "fatal"] as const;

function toIso(local: string) {
  if (!local) return undefined;
  const d = new Date(local);
  return isNaN(+d) ? undefined : d.toISOString();
}

function PlayerChips({ player }: { player: LogRow["player"] }) {
  const chips = [player.name ? `name: ${player.name}` : null, player.source != null ? `src: ${player.source}` : null, player.license ? `license: ${player.license}` : null, player.discord ? `discord: ${player.discord}` : null].filter(Boolean) as string[];
  if (!chips.length) return null;
  return <span className="flex flex-wrap gap-1">{chips.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}</span>;
}

function LogEntry({ log }: { log: LogRow }) {
  const [open, setOpen] = React.useState(false);
  const hasMeta = !!log.metadata && Object.keys(log.metadata as object).length > 0;
  return (
    <li className="border-b border-border last:border-0">
      <div className="flex items-start gap-2 px-3 py-2 text-sm">
        <button type="button" className={cn("mt-0.5 rounded p-0.5 text-fg-subtle hover:text-fg", !hasMeta && "invisible")} aria-expanded={open} aria-label={open ? "Hide metadata" : "Show metadata"} onClick={() => setOpen((o) => !o)}>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
        <time className="shrink-0 whitespace-nowrap font-mono text-xs text-fg-subtle" dateTime={log.timestamp}>{formatDateTime(log.timestamp)}</time>
        <StatusBadge status={log.level} />
        <div className="min-w-0 flex-1">
          <p className="break-words">{log.message}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-fg-muted">
            <Badge variant="default">{log.dataset}</Badge>
            {log.resource ? <Badge variant="outline">{log.resource}</Badge> : null}
            <PlayerChips player={log.player} />
          </div>
        </div>
      </div>
      {open && hasMeta ? <pre className="mx-3 mb-3 max-h-64 overflow-auto rounded-md border border-border bg-bg-muted p-3 text-xs scrollbar-thin">{JSON.stringify(log.metadata, null, 2)}</pre> : null}
    </li>
  );
}

export function LogsExplorer({ servers, initialServerId, initialDataset }: { servers: HubServerOption[]; initialServerId: string; initialDataset: string }) {
  const [serverId, setServerId] = React.useState(initialServerId);
  const [filters, setFilters] = React.useState({ from: "", to: "", dataset: initialDataset, resource: "", player: "", q: "" });
  const [levels, setLevels] = React.useState<string[]>([]);
  const [logs, setLogs] = React.useState<LogRow[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const sentinel = React.useRef<HTMLDivElement>(null);
  const current = servers.find((s) => s.id === serverId);

  const buildQuery = React.useCallback((next?: string | null) => {
    const sp = new URLSearchParams();
    sp.set("projectId", serverId);
    const from = toIso(filters.from); const to = toIso(filters.to);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    levels.forEach((l) => sp.append("level", l));
    if (filters.dataset) sp.set("dataset", filters.dataset);
    if (filters.resource) sp.set("resource", filters.resource);
    if (filters.player) sp.set("player", filters.player);
    if (filters.q) sp.set("q", filters.q);
    if (next) sp.set("cursor", next);
    return sp.toString();
  }, [serverId, filters, levels]);

  const load = React.useCallback(async (next: string | null) => {
    if (!serverId) return;
    setLoading(true); setError(null);
    try {
      const r = await api<{ logs: LogRow[]; nextCursor: string | null }>(`/api/v1/server-hub/logs?${buildQuery(next)}`);
      setLogs((prev) => (next ? [...prev, ...r.logs] : r.logs));
      setCursor(r.nextCursor);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [serverId, buildQuery]);

  // Initial + filtered load
  React.useEffect(() => { setLogs([]); setCursor(null); load(null); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, reloadKey]);

  // Infinite scroll
  React.useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting && !loading) load(cursor); }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loading, load]);

  const applyFilters = (e: React.FormEvent) => { e.preventDefault(); setReloadKey((k) => k + 1); };
  const clear = () => { setFilters({ from: "", to: "", dataset: "", resource: "", player: "", q: "" }); setLevels([]); setReloadKey((k) => k + 1); };
  const hasFilters = levels.length > 0 || Object.values(filters).some(Boolean);

  if (!servers.length) return <EmptyState icon={Terminal} title="No servers yet" description="Create a server in the Server Hub to start collecting logs." action={{ label: "Server Hub", href: "/app/hub" }} />;

  return (
    <div className="space-y-4">
      <form onSubmit={applyFilters} className="space-y-3" role="search" aria-label="Search logs">
        <div className="flex flex-col gap-2 sm:flex-row">
          <NativeSelect aria-label="Server" value={serverId} onChange={(e) => setServerId(e.target.value)} className="sm:w-56">{servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-subtle" aria-hidden /><Input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Search messages and metadata…" className="pl-8" aria-label="Free text search" /></div>
          <div className="flex gap-2">
            <Button type="submit" size="default" loading={loading && !logs.length}>Search</Button>
            <Button type="button" variant="outline" aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}><Filter /> Filters{hasFilters ? <span className="ml-1 rounded-full bg-accent px-1.5 text-[10px] text-accent-fg">{levels.length + Object.values(filters).filter(Boolean).length}</span> : null}</Button>
          </div>
        </div>
        {showFilters ? (
          <div className="grid gap-3 rounded-lg border border-border bg-bg-elevated p-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="From" htmlFor="log-from"><Input id="log-from" type="datetime-local" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
            <Field label="To" htmlFor="log-to"><Input id="log-to" type="datetime-local" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
            <Field label="Dataset" htmlFor="log-dataset"><NativeSelect id="log-dataset" value={filters.dataset} onChange={(e) => setFilters({ ...filters, dataset: e.target.value })}><option value="">All datasets</option>{(current?.datasets ?? []).map((d) => <option key={d} value={d}>{d}</option>)}</NativeSelect></Field>
            <Field label="Resource" htmlFor="log-resource"><Input id="log-resource" value={filters.resource} onChange={(e) => setFilters({ ...filters, resource: e.target.value })} placeholder="inventory" /></Field>
            <Field label="Player" htmlFor="log-player" hint="Name, license, Discord id or server id."><Input id="log-player" value={filters.player} onChange={(e) => setFilters({ ...filters, player: e.target.value })} /></Field>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Levels</legend>
              <div className="flex flex-wrap gap-3">
                {LEVELS.map((l) => (
                  <div key={l} className="flex items-center gap-1.5">
                    <Checkbox id={`lvl-${l}`} checked={levels.includes(l)} onCheckedChange={(v) => setLevels((prev) => (v === true ? [...prev, l] : prev.filter((x) => x !== l)))} />
                    <Label htmlFor={`lvl-${l}`} className="font-normal capitalize">{l}</Label>
                  </div>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2 lg:col-span-3 flex gap-2"><Button type="submit" size="sm" loading={loading}>Apply filters</Button>{hasFilters ? <Button type="button" size="sm" variant="ghost" onClick={clear}><X /> Clear</Button> : null}</div>
          </div>
        ) : null}
      </form>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      {logs.length === 0 && !loading ? (
        <EmptyState icon={Terminal} title={hasFilters ? "No logs match these filters" : "No logs yet"} description={hasFilters ? "Try widening the time range or clearing filters." : "Install the msmhub resource and set your token — events show up here within seconds."} action={hasFilters ? { label: "Clear filters", onClick: clear } : { label: "Setup instructions", href: `/app/hub/servers/${serverId}` }} />
      ) : (
        <>
          <ul className="rounded-lg border border-border bg-bg-elevated" aria-live="polite" aria-busy={loading}>{logs.map((l) => <LogEntry key={l.id} log={l} />)}</ul>
          <div ref={sentinel} className="flex justify-center py-4">
            {loading ? <span className="inline-flex items-center gap-2 text-sm text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading more…</span>
              : cursor ? <Button variant="outline" size="sm" onClick={() => load(cursor)}>Load more</Button>
              : logs.length ? <span className="text-xs text-fg-subtle">End of results · {logs.length} event{logs.length === 1 ? "" : "s"}</span> : null}
          </div>
        </>
      )}
      {!logs.length && loading ? <div className="flex justify-center py-8"><Spinner /></div> : null}
      <p className="text-xs text-fg-subtle">Need raw access? Logs are also available through the <Link href="/app/hub" className="text-accent hover:underline">Server Hub API</Link>.</p>
    </div>
  );
}
