"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, List, Search, FolderOpen, Globe, RefreshCw, X } from "lucide-react";
import { TOOL_BY_SLUG } from "@modsmith/core";
import { cn, formatCredits, formatDate, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, Pagination } from "@/components/ui/misc";
import { CreationThumb } from "./creation-thumb";
import { CreationActions } from "./creation-actions";
import type { CreationRow } from "./types";

export interface CreationFilters { toolSlug: string; status: string; from: string; to: string; q: string; sort: string }
const VIEW_KEY = "ms.creationsView";
const STATUSES = ["DRAFT", "PROCESSING", "READY", "FAILED", "ARCHIVED"];

export function CreationsList({ creations, total, page, pageSize, filters, tools }: { creations: CreationRow[]; total: number; page: number; pageSize: number; filters: CreationFilters; tools: { slug: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const [q, setQ] = React.useState(filters.q);
  React.useEffect(() => { try { const v = localStorage.getItem(VIEW_KEY); if (v === "list" || v === "grid") setView(v); } catch { /* ignore */ } }, []);
  React.useEffect(() => { setQ(filters.q); }, [filters.q]);
  const changeView = (v: "grid" | "list") => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };

  const buildHref = (patch: Partial<CreationFilters & { page: number }>) => {
    const next = { ...filters, page: 1, ...patch };
    const sp = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => { if (v && !(k === "page" && v === 1) && !(k === "sort" && v === "newest")) sp.set(k, String(v)); });
    const s = sp.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const apply = (patch: Partial<CreationFilters>) => router.push(buildHref(patch));
  const hasFilters = !!(filters.toolSlug || filters.status || filters.from || filters.to || filters.q);

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); apply({ q }); }} className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center" role="search" aria-label="Filter creations">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-subtle" aria-hidden /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" className="pl-8" aria-label="Search" /></div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <NativeSelect aria-label="Tool" value={filters.toolSlug} onChange={(e) => apply({ toolSlug: e.target.value })} className="sm:w-44"><option value="">All tools</option>{tools.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</NativeSelect>
          <NativeSelect aria-label="Status" value={filters.status} onChange={(e) => apply({ status: e.target.value })} className="sm:w-36"><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</NativeSelect>
          <Input type="date" aria-label="From date" value={filters.from} onChange={(e) => apply({ from: e.target.value })} className="sm:w-36" />
          <Input type="date" aria-label="To date" value={filters.to} onChange={(e) => apply({ to: e.target.value })} className="sm:w-36" />
          <NativeSelect aria-label="Sort" value={filters.sort || "newest"} onChange={(e) => apply({ sort: e.target.value })} className="sm:w-32"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option></NativeSelect>
        </div>
        <div className="flex items-center gap-1">
          {hasFilters ? <Button type="button" variant="ghost" size="sm" onClick={() => { setQ(""); router.push(pathname); }}><X /> Clear</Button> : null}
          <div className="ml-auto flex rounded-md border border-border p-0.5" role="group" aria-label="View">
            <Button type="button" variant={view === "grid" ? "secondary" : "ghost"} size="icon-sm" aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => changeView("grid")}><LayoutGrid /></Button>
            <Button type="button" variant={view === "list" ? "secondary" : "ghost"} size="icon-sm" aria-pressed={view === "list"} aria-label="List view" onClick={() => changeView("list")}><List /></Button>
          </div>
        </div>
      </form>

      {creations.length === 0 ? (
        hasFilters ? <EmptyState icon={Search} title="No creations match" description="Try a different search or clear the filters." action={{ label: "Clear filters", onClick: () => router.push(pathname) }} />
          : <EmptyState icon={FolderOpen} title="Nothing here yet" description="Every asset you export lands here with its versions, downloads and free re-export window. Start with any tool." action={{ label: "Browse tools", href: "/app/tools" }} />
      ) : view === "grid" ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {creations.map((c) => <li key={c.id}><CreationCard creation={c} /></li>)}
        </ul>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-bg-elevated">
          {creations.map((c) => <li key={c.id}><CreationListRow creation={c} /></li>)}
        </ul>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => buildHref({ page: p })} />
      {total > 0 ? <p className="mt-2 text-xs text-fg-subtle">{total} creation{total === 1 ? "" : "s"}</p> : null}
    </div>
  );
}

function ReexportBadge({ until }: { until: string | null }) {
  if (!until || new Date(until) <= new Date()) return null;
  return <Badge variant="success"><RefreshCw className="h-3 w-3" aria-hidden /> Free re-export until {formatDate(until)}</Badge>;
}

function CreationCard({ creation: c }: { creation: CreationRow }) {
  const tool = TOOL_BY_SLUG[c.toolSlug];
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-bg-elevated transition-colors hover:border-accent/40">
      <Link href={`/app/creations/${c.id}`} className="block" aria-label={`Open ${c.name}`}><CreationThumb url={c.thumbnailUrl} toolSlug={c.toolSlug} name={c.name} className="aspect-video" /></Link>
      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><Link href={`/app/creations/${c.id}`} className="block truncate text-sm font-medium hover:text-accent">{c.name}</Link><div className="mt-0.5 text-xs text-fg-muted">{tool?.name ?? c.toolSlug}{c.exportVersion ? ` · v${c.exportVersion}` : ""}</div></div>
          <CreationActions creation={c} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1"><StatusBadge status={c.status} />{c.isPublic ? <Badge variant="accent"><Globe className="h-3 w-3" aria-hidden /> Public</Badge> : null}<ReexportBadge until={c.reexportUntil} /></div>
        <div className="mt-auto flex items-center justify-between pt-3 text-xs text-fg-subtle"><span>{c.lastCreditCost != null ? `${formatCredits(c.lastCreditCost)} credits` : "Not exported"}</span><span>{timeAgo(c.updatedAt)}</span></div>
      </div>
    </article>
  );
}

function CreationListRow({ creation: c }: { creation: CreationRow }) {
  const tool = TOOL_BY_SLUG[c.toolSlug];
  return (
    <div className="flex items-center gap-3 p-3">
      <Link href={`/app/creations/${c.id}`} className="shrink-0" aria-label={`Open ${c.name}`}><CreationThumb url={c.thumbnailUrl} toolSlug={c.toolSlug} name={c.name} className="h-12 w-16 rounded-md" /></Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><Link href={`/app/creations/${c.id}`} className="truncate text-sm font-medium hover:text-accent">{c.name}</Link><StatusBadge status={c.status} />{c.isPublic ? <Badge variant="accent">Public</Badge> : null}<ReexportBadge until={c.reexportUntil} /></div>
        <div className={cn("mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-muted")}><span>{tool?.name ?? c.toolSlug}</span>{c.exportVersion ? <span>v{c.exportVersion}</span> : null}<span>{c.lastCreditCost != null ? `${formatCredits(c.lastCreditCost)} credits` : "Not exported"}</span><span className="hidden sm:inline">Updated {timeAgo(c.updatedAt)}</span></div>
      </div>
      <CreationActions creation={c} />
    </div>
  );
}
