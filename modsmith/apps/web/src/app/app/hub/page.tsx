import type { Metadata } from "next";
import Link from "next/link";
import { Database, HardDrive, Image as ImageIcon, Server, Clock } from "lucide-react";
import { prisma } from "@modsmith/db";
import { getStorageLimits } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { formatBytes, formatCredits, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { HubNav } from "@/components/app/hub/hub-nav";
import { CreateServerDialog } from "@/components/app/hub/create-server-dialog";

export const metadata: Metadata = { title: "Server Hub" };
export const dynamic = "force-dynamic";

export default async function HubOverviewPage() {
  const user = (await getCurrentUser())!;
  const [limits, projects, logs24h, mediaCount] = await Promise.all([
    getStorageLimits(user.id),
    prisma.serverHubProject.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: "asc" }, include: { _count: { select: { logs: true, media: true, tokens: { where: { revokedAt: null } } } }, datasets: { select: { name: true, eventCount: true, lastEventAt: true }, orderBy: { name: "asc" }, take: 6 } } }),
    prisma.serverHubLog.count({ where: { project: { userId: user.id }, receivedAt: { gte: new Date(Date.now() - 86400_000) } } }),
    prisma.serverHubMedia.count({ where: { project: { userId: user.id }, deletedAt: null } }),
  ]);
  const used = Number(limits.usedBytes);
  const limit = Number(limits.limitBytes);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const atLimit = projects.length >= limits.maxServers;

  return (
    <div>
      <PageHeader title="Server Hub" description="Searchable logs, private screenshots and phone media for your FiveM servers." actions={projects.length ? <CreateServerDialog variant="outline" /> : undefined} />
      <HubNav />

      {projects.length === 0 ? (
        <div className="space-y-4">
          <EmptyState icon={Server} title="No servers yet" description="Create a server, generate a token and drop the msmhub resource into your FiveM server to start streaming logs, screenshots and phone media." />
          <div className="flex justify-center"><CreateServerDialog /></div>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Servers" value={`${projects.length} / ${limits.maxServers}`} icon={Server} hint={limits.plan ? limits.plan.name : "Free tier"} />
            <Stat label="Logs (24h)" value={formatCredits(logs24h)} icon={Database} hint={`${limits.retentionDays} day retention`} />
            <Stat label="Media files" value={formatCredits(mediaCount)} icon={ImageIcon} hint="Screenshots and phone media" />
            <div className="rounded-lg border border-border bg-bg-elevated p-4">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-fg-subtle">Storage<HardDrive className="h-4 w-4" aria-hidden /></div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{formatBytes(used)}</div>
              <Progress value={pct} className="mt-2 h-1.5" indicatorClassName={pct > 90 ? "bg-danger" : pct > 70 ? "bg-warning" : undefined} aria-label="Storage used" />
              <div className="mt-1 text-xs text-fg-muted">{pct}% of {formatBytes(limit)}</div>
            </div>
          </section>

          {atLimit ? <p className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">You've used all {limits.maxServers} server slot{limits.maxServers === 1 ? "" : "s"} on your plan. <Link href="/pricing" className="underline">Upgrade</Link> to add more.</p> : null}

          <section aria-labelledby="servers">
            <h2 id="servers" className="mb-3 text-lg font-semibold">Your servers</h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/app/hub/servers/${p.id}`} className="flex h-full flex-col rounded-lg border border-border bg-bg-elevated p-4 transition-colors hover:border-accent/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><h3 className="truncate font-semibold">{p.name}</h3>{p.description ? <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{p.description}</p> : null}</div>
                      <Badge variant="default">{p.framework}</Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div><dt className="text-xs text-fg-subtle">Logs</dt><dd className="font-medium tabular-nums">{formatCredits(p._count.logs)}</dd></div>
                      <div><dt className="text-xs text-fg-subtle">Media</dt><dd className="font-medium tabular-nums">{formatCredits(p._count.media)}</dd></div>
                      <div><dt className="text-xs text-fg-subtle">Tokens</dt><dd className="font-medium tabular-nums">{p._count.tokens}</dd></div>
                    </dl>
                    {p.datasets.length ? <div className="mt-3 flex flex-wrap gap-1">{p.datasets.map((d) => <Badge key={d.name} variant="outline">{d.name}</Badge>)}</div> : <p className="mt-3 text-xs text-fg-subtle">No datasets yet — waiting for the first event.</p>}
                    <div className="mt-auto flex items-center gap-1 pt-3 text-xs text-fg-subtle"><Clock className="h-3 w-3" aria-hidden /> Created {timeAgo(p.createdAt)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild><Link href="/app/hub/logs">Search logs</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/app/hub/media">Browse media</Link></Button>
            <Button variant="ghost" size="sm" asChild><a href="/api/v1/server-hub/resource">Download msmhub resource</a></Button>
          </div>
        </div>
      )}
    </div>
  );
}
