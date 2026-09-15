import type { Metadata } from "next";
import Link from "next/link";
import { HardDrive } from "lucide-react";
import { prisma } from "@modsmith/db";
import { getStorageLimits } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { formatBytes, formatCredits } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/ui/misc";
import { HubNav } from "@/components/app/hub/hub-nav";

export const metadata: Metadata = { title: "Server Hub settings" };
export const dynamic = "force-dynamic";

export default async function HubSettingsPage() {
  const user = (await getCurrentUser())!;
  const [limits, servers, logs, media] = await Promise.all([
    getStorageLimits(user.id),
    prisma.serverHubProject.count({ where: { userId: user.id, deletedAt: null } }),
    prisma.serverHubLog.count({ where: { project: { userId: user.id } } }),
    prisma.serverHubMedia.count({ where: { project: { userId: user.id }, deletedAt: null } }),
  ]);
  const used = Number(limits.usedBytes);
  const limit = Number(limits.limitBytes);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div>
      <PageHeader title="Server Hub settings" description="Storage, retention and plan limits for your servers." />
      <HubNav />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-accent" aria-hidden /> Storage</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Progress value={pct} indicatorClassName={pct > 90 ? "bg-danger" : pct > 70 ? "bg-warning" : undefined} aria-label="Storage used" />
            <p className="text-sm text-fg-muted">{formatBytes(used)} of {formatBytes(limit)} used ({pct}%). Media counts toward storage; log rows do not.</p>
            <dl className="divide-y divide-border text-sm">
              <div className="flex justify-between py-2"><dt className="text-fg-muted">Servers</dt><dd className="font-medium">{servers} / {limits.maxServers}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-fg-muted">Log retention</dt><dd className="font-medium">{limits.retentionDays} days</dd></div>
              <div className="flex justify-between py-2"><dt className="text-fg-muted">Stored logs</dt><dd className="font-medium tabular-nums">{formatCredits(logs)}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-fg-muted">Stored media</dt><dd className="font-medium tabular-nums">{formatCredits(media)}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-fg-muted">Plan</dt><dd className="font-medium">{limits.plan?.name ?? "Free tier"}</dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Need more room?</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-fg-muted">
            <p>Server Hub plans raise the number of servers, the storage limit and how long logs are kept. Logs older than your retention window are deleted automatically.</p>
            <ul className="space-y-1">
              <li>• Retention is applied per event as it is ingested.</li>
              <li>• Deleting a server frees its media storage immediately.</li>
              <li>• Media is private: it is only ever served through short-lived signed links.</li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" asChild><Link href="/pricing">See Hub plans</Link></Button>
              <Button size="sm" variant="outline" asChild><Link href="/app/billing">Billing</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
