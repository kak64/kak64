import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Database, Image as ImageIcon, Terminal } from "lucide-react";
import { prisma } from "@modsmith/db";
import { env } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { formatCredits, formatDateTime, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { HubNav } from "@/components/app/hub/hub-nav";
import { ServerTokens, type TokenRow } from "@/components/app/hub/server-tokens";
import { DeleteServerDialog } from "@/components/app/hub/delete-server-dialog";
import { CopyButton } from "@/components/app/hub/copy-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await getCurrentUser();
  const { id } = await params;
  const p = user ? await prisma.serverHubProject.findFirst({ where: { id, userId: user.id, deletedAt: null }, select: { name: true } }) : null;
  return { title: p?.name ?? "Server" };
}

export default async function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await getCurrentUser())!;
  const { id } = await params;
  const project = await prisma.serverHubProject.findFirst({ where: { id, userId: user.id, deletedAt: null }, include: { tokens: { orderBy: { createdAt: "desc" } }, datasets: { orderBy: { name: "asc" } }, _count: { select: { logs: true, media: true } } } });
  if (!project) notFound();
  const lastLog = await prisma.serverHubLog.findFirst({ where: { projectId: project.id }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } });
  const endpoint = env().APP_URL;
  const tokens: TokenRow[] = project.tokens.map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, lastUsedAt: t.lastUsedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(), revokedAt: t.revokedAt?.toISOString() ?? null }));
  const cfg = `# Modsmith Server Hub — ${project.name}\nset msmhub_token "YOUR_TOKEN_HERE"\nset msmhub_endpoint "${endpoint}"\nensure msmhub`;

  return (
    <div>
      <HubNav />
      <Link href="/app/hub" className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden /> All servers</Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1><p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted"><Badge variant="default">{project.framework}</Badge>{project.description ? <span>{project.description}</span> : null}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild><Link href={`/app/hub/logs?server=${project.id}`}><Terminal /> Logs</Link></Button>
          <Button size="sm" variant="outline" asChild><Link href={`/app/hub/media?server=${project.id}`}><ImageIcon /> Media</Link></Button>
          <DeleteServerDialog projectId={project.id} name={project.name} />
        </div>
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Log events" value={formatCredits(project._count.logs)} icon={Database} hint={lastLog ? `Last ${timeAgo(lastLog.occurredAt)}` : "No events yet"} />
        <Stat label="Media files" value={formatCredits(project._count.media)} icon={ImageIcon} />
        <Stat label="Active tokens" value={tokens.filter((t) => !t.revokedAt).length} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardContent className="pt-5"><ServerTokens projectId={project.id} tokens={tokens} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Install the resource</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ol className="space-y-2 text-sm text-fg-muted">
              <li>1. Download <code className="font-mono text-xs">msmhub</code> and copy the folder into your server's <code className="font-mono text-xs">resources/</code>.</li>
              <li>2. Generate a token above and paste it into your <code className="font-mono text-xs">server.cfg</code>.</li>
              <li>3. Restart the server — events start appearing in the Logs tab straight away.</li>
            </ol>
            <div className="relative">
              <pre className="overflow-x-auto rounded-md border border-border bg-bg-muted p-3 pr-12 text-xs"><code>{cfg}</code></pre>
              <div className="absolute right-2 top-2"><CopyButton value={cfg} iconOnly label="Copy server.cfg snippet" toastTitle="Snippet copied" /></div>
            </div>
            <p className="text-xs text-fg-subtle">The token is only ever read on the server. Never place it in a client script.</p>
            <Button size="sm" asChild><a href="/api/v1/server-hub/resource"><Download /> Download msmhub resource</a></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Datasets</CardTitle></CardHeader>
          <CardContent>
            {project.datasets.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Datasets for this server</caption>
                  <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle"><th scope="col" className="py-2 pr-3">Dataset</th><th scope="col" className="py-2 pr-3">Events</th><th scope="col" className="py-2">Last event</th></tr></thead>
                  <tbody>{project.datasets.map((d) => <tr key={d.id} className="border-b border-border last:border-0"><td className="py-2 pr-3"><Link href={`/app/hub/logs?server=${project.id}&dataset=${encodeURIComponent(d.name)}`} className="font-mono text-[13px] hover:text-accent">{d.name}</Link></td><td className="py-2 pr-3 tabular-nums">{formatCredits(d.eventCount)}</td><td className="py-2 text-fg-muted">{d.lastEventAt ? formatDateTime(d.lastEventAt) : "—"}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <p className="text-sm text-fg-muted">Datasets are created automatically from the <code className="font-mono text-xs">dataset</code> field of incoming events (for example <code className="font-mono text-xs">anticheat</code> or <code className="font-mono text-xs">inventory</code>).</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
