import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Globe, Pencil, RefreshCw, StickyNote } from "lucide-react";
import { prisma } from "@modsmith/db";
import { TOOL_BY_SLUG } from "@modsmith/core";
import { storage } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { formatBytes, formatCredits, formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { CreationThumb } from "@/components/app/creations/creation-thumb";
import { ManifestTree } from "@/components/app/creations/manifest-tree";
import { CreationDetailActions, CreationLiveJob, VersionDownload } from "@/components/app/creations/creation-detail-client";
import { ACTIVE_JOB_STATUSES, type CreationRow } from "@/components/app/creations/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await getCurrentUser();
  const { id } = await params;
  const c = user ? await prisma.creation.findFirst({ where: { id, userId: user.id, deletedAt: null }, select: { name: true } }) : null;
  return { title: c?.name ?? "Creation" };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-4 py-2 text-sm"><dt className="shrink-0 text-fg-muted">{label}</dt><dd className="min-w-0 text-right font-medium break-words">{children}</dd></div>;
}

export default async function CreationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await getCurrentUser())!;
  const { id } = await params;
  const c = await prisma.creation.findFirst({ where: { id, userId: user.id, deletedAt: null }, include: { currentVersion: true, currentJob: { select: { id: true, status: true, stage: true, progress: true, errorMessage: true } }, showcaseItem: true, versions: { orderBy: { version: "desc" }, take: 50 } } });
  if (!c) notFound();
  const tool = TOOL_BY_SLUG[c.toolSlug];
  const thumbnailUrl = c.thumbnailKey ? await storage().signedGetUrl(c.thumbnailKey, { ttl: 3600 }).catch(() => null) : null;
  const row: CreationRow = {
    id: c.id, name: c.name, toolSlug: c.toolSlug, status: c.status, originalFilename: c.originalFilename, exportVersion: c.exportVersion, lastCreditCost: c.lastCreditCost, reexportUntil: c.reexportUntil?.toISOString() ?? null, isPublic: c.isPublic, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), thumbnailUrl,
    currentVersion: c.currentVersion ? { id: c.currentVersion.id, version: c.currentVersion.version, resourceName: c.currentVersion.resourceName, sizeBytes: Number(c.currentVersion.sizeBytes), createdAt: c.currentVersion.createdAt.toISOString() } : null,
    currentJob: c.currentJob ? { id: c.currentJob.id, status: c.currentJob.status, stage: c.currentJob.stage, progress: c.currentJob.progress } : null,
    showcase: c.showcaseItem ? { slug: c.showcaseItem.slug, status: c.showcaseItem.status, title: c.showcaseItem.title, description: c.showcaseItem.description, category: c.showcaseItem.category, tags: c.showcaseItem.tags, allowDownload: c.showcaseItem.allowDownload, allowRemix: c.showcaseItem.allowRemix } : null,
  };
  const jobActive = !!c.currentJob && ACTIVE_JOB_STATUSES.includes(c.currentJob.status);
  const freeUntil = c.reexportUntil && c.reexportUntil > new Date() ? c.reexportUntil : null;
  const projectNote = c.projectState && typeof c.projectState === "object" ? Object.keys(c.projectState as object).length : 0;

  return (
    <div className="space-y-6">
      <Link href="/app/creations" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden /> My Creations</Link>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <CreationThumb url={thumbnailUrl} toolSlug={c.toolSlug} name={c.name} className="h-20 w-28 shrink-0 rounded-lg border border-border" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{c.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted"><span>{tool?.name ?? c.toolSlug}</span><StatusBadge status={c.status} />{c.isPublic ? <Badge variant="accent"><Globe className="h-3 w-3" aria-hidden /> Public</Badge> : null}{freeUntil ? <Badge variant="success"><RefreshCw className="h-3 w-3" aria-hidden /> Free re-export until {formatDate(freeUntil)}</Badge> : null}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tool ? <Button variant="outline" size="sm" asChild><Link href={`${tool.href}?creation=${c.id}`}><Pencil /> Open in editor</Link></Button> : null}
          <CreationDetailActions creation={row} />
        </div>
      </div>

      {jobActive && c.currentJob ? <section aria-label="Current build"><CreationLiveJob jobId={c.currentJob.id} creationId={c.id} /></section> : null}
      {!jobActive && c.currentJob && ["FAILED", "REFUNDED"].includes(c.currentJob.status) ? <Alert variant="danger" title="Last build failed">{c.currentJob.errorMessage ?? "The build did not complete."} <Link href={`/app/jobs/${c.currentJob.id}`} className="underline">View job log</Link></Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <Row label="Tool">{tool?.name ?? c.toolSlug}</Row>
              <Row label="Status"><StatusBadge status={c.status} /></Row>
              <Row label="Original file">{c.originalFilename ?? "—"}</Row>
              <Row label="Created">{formatDateTime(c.createdAt)}</Row>
              <Row label="Updated">{formatDateTime(c.updatedAt)}</Row>
              <Row label="Last credit cost">{c.lastCreditCost != null ? `${formatCredits(c.lastCreditCost)} credits` : "—"}</Row>
              <Row label="Free re-export">{freeUntil ? `until ${formatDateTime(freeUntil)}` : c.reexportUntil ? `expired ${formatDate(c.reexportUntil)}` : "—"}</Row>
              <Row label="Versions">{c.versions.length}</Row>
              <Row label="Showcase">{c.showcaseItem ? <span className="inline-flex items-center gap-1"><StatusBadge status={c.showcaseItem.status} />{c.showcaseItem.status === "PUBLISHED" ? <Link href={`/showcase/${c.showcaseItem.slug}`} className="text-accent hover:underline"><ExternalLink className="inline h-3.5 w-3.5" aria-label="Public page" /></Link> : null}</span> : "Not published"}</Row>
            </dl>
            {projectNote ? <p className="mt-3 flex items-start gap-2 rounded-md border border-border bg-bg-muted p-2 text-xs text-fg-muted"><StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Editor state is saved with this creation. Open it in the editor to continue where you left off.</p> : null}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Current version</CardTitle></CardHeader>
            <CardContent>
              {c.currentVersion ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><div><span className="font-medium">v{c.currentVersion.version}</span> · <span className="font-mono text-[13px]">{c.currentVersion.resourceName}</span></div><div className="text-fg-muted">{formatBytes(c.currentVersion.sizeBytes)} · {formatDateTime(c.currentVersion.createdAt)}</div></div>
                  <ManifestTree manifest={c.currentVersion.manifest} />
                </div>
              ) : <p className="text-sm text-fg-muted">{jobActive ? "The first version will appear when the build completes." : "No exported version yet. Open the editor to build this creation."}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Version history</CardTitle></CardHeader>
            <CardContent>
              {c.versions.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle"><th className="py-2 pr-3">Version</th><th className="py-2 pr-3">File</th><th className="py-2 pr-3">Size</th><th className="py-2 pr-3">Credits</th><th className="py-2 pr-3">Built</th><th className="py-2"></th></tr></thead>
                    <tbody>{c.versions.map((v) => <tr key={v.id} className="border-b border-border last:border-0"><td className="py-2 pr-3 font-medium">v{v.version}{v.id === c.currentVersionId ? <Badge variant="accent" className="ml-2">current</Badge> : null}</td><td className="py-2 pr-3 font-mono text-[13px]">{v.resourceName}</td><td className="py-2 pr-3 tabular-nums">{formatBytes(v.sizeBytes)}</td><td className="py-2 pr-3 tabular-nums">{v.creditCost === 0 ? <span className="text-success">free</span> : formatCredits(v.creditCost)}</td><td className="py-2 pr-3 text-fg-muted">{formatDateTime(v.createdAt)}</td><td className="py-2 text-right"><VersionDownload creationId={c.id} version={v.version} /></td></tr>)}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-fg-muted">Versions are recorded every time you export.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
