import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Coins, FileStack, Flag, Images, ListChecks, Server, Star, Users, Wallet } from "lucide-react";
import { prisma } from "@modsmith/db";
import { queueStats } from "@modsmith/services";
import { getTool } from "@modsmith/core";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionTable } from "@/components/admin/section";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty } from "@/components/admin/table";
import { requireStaff } from "@/components/admin/guard";
import { formatCredits, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  // Moderators have no overview: send them to the first section they can use.
  const staff = await requireStaff();
  if (staff.role !== "ADMIN") redirect("/admin/users");
  const since = new Date(Date.now() - 30 * 86400_000);
  const day = new Date(Date.now() - 86400_000);
  const [users, newUsers30d, jobs24h, failed24h, activeJobs, revenue, purchases30d, activeSubscriptions, creations, showcase, pendingReviews, openReports, hubLogs24h, creditsSpent, queues, jobsByTool] = await Promise.all([
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.processingJob.count({ where: { createdAt: { gte: day } } }),
    prisma.processingJob.count({ where: { createdAt: { gte: day }, status: { in: ["FAILED", "REFUNDED"] } } }),
    prisma.processingJob.count({ where: { status: { in: ["QUEUED", "PROCESSING", "PACKAGING"] } } }),
    prisma.creditPurchase.aggregate({ where: { status: "PAID", paidAt: { gte: since } }, _sum: { amountCents: true } }),
    prisma.creditPurchase.count({ where: { status: "PAID", paidAt: { gte: since } } }),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] } } }),
    prisma.creation.count({ where: { deletedAt: null } }),
    prisma.showcaseItem.count({ where: { status: "PUBLISHED" } }),
    prisma.review.count({ where: { status: "PENDING" } }),
    prisma.abuseReport.count({ where: { status: "open" } }),
    prisma.serverHubLog.count({ where: { receivedAt: { gte: day } } }),
    prisma.creditTransaction.aggregate({ where: { type: "EXPORT", createdAt: { gte: since } }, _sum: { amount: true } }),
    queueStats(),
    prisma.processingJob.groupBy({ by: ["toolSlug", "status"], _count: { _all: true }, where: { createdAt: { gte: since } } }),
  ]);

  const revenueCents30d = revenue._sum.amountCents ?? 0;
  const creditsSpent30d = -(creditsSpent._sum.amount ?? 0);
  const failRate = jobs24h ? Math.round((failed24h / jobs24h) * 100) : 0;

  const byTool = new Map<string, { total: number; statuses: Record<string, number> }>();
  for (const row of jobsByTool) {
    const entry = byTool.get(row.toolSlug) ?? { total: 0, statuses: {} };
    entry.total += row._count._all;
    entry.statuses[row.status] = (entry.statuses[row.status] ?? 0) + row._count._all;
    byTool.set(row.toolSlug, entry);
  }
  const toolRows = [...byTool.entries()].sort((a, b) => b[1].total - a[1].total);
  const queueRows = Object.entries(queues);

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Platform activity at a glance. Revenue and credits cover the last 30 days."
        actions={<Button asChild variant="outline" size="sm"><Link href="/admin/health">System health</Link></Button>} />

      {pendingReviews > 0 || openReports > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-medium">Moderation queue needs attention.</span>
          {pendingReviews > 0 ? <Link href="/admin/reviews?status=PENDING" className="underline underline-offset-4">{pendingReviews} pending review{pendingReviews === 1 ? "" : "s"}</Link> : null}
          {openReports > 0 ? <Link href="/admin/reports?status=open" className="underline underline-offset-4">{openReports} open report{openReports === 1 ? "" : "s"}</Link> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active users" value={users.toLocaleString("en-US")} hint={`+${newUsers30d.toLocaleString("en-US")} in 30d`} icon={Users} />
        <Stat label="Revenue 30d" value={formatMoney(revenueCents30d)} hint={`${purchases30d.toLocaleString("en-US")} purchases`} icon={Wallet} />
        <Stat label="Jobs 24h" value={jobs24h.toLocaleString("en-US")} hint={`${failed24h} failed (${failRate}%)`} icon={ListChecks} />
        <Stat label="Active jobs" value={activeJobs.toLocaleString("en-US")} hint="queued, processing or packaging" icon={ListChecks} />
        <Stat label="Active subscriptions" value={activeSubscriptions.toLocaleString("en-US")} hint="active or trialing" icon={Wallet} />
        <Stat label="Credits spent 30d" value={formatCredits(creditsSpent30d)} hint="exports charged" icon={Coins} />
        <Stat label="Creations" value={creations.toLocaleString("en-US")} hint={`${showcase.toLocaleString("en-US")} in showcase`} icon={FileStack} />
        <Stat label="Hub logs 24h" value={hubLogs24h.toLocaleString("en-US")} hint="ingested events" icon={Server} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Link href="/admin/reviews?status=PENDING" className="rounded-lg border border-border bg-bg-elevated p-4 transition-colors hover:border-accent/50">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-subtle"><Star className="h-4 w-4" aria-hidden />Pending reviews</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{pendingReviews}</div>
        </Link>
        <Link href="/admin/reports?status=open" className="rounded-lg border border-border bg-bg-elevated p-4 transition-colors hover:border-accent/50">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-subtle"><Flag className="h-4 w-4" aria-hidden />Open reports</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{openReports}</div>
        </Link>
        <Link href="/admin/showcase" className="rounded-lg border border-border bg-bg-elevated p-4 transition-colors hover:border-accent/50">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-subtle"><Images className="h-4 w-4" aria-hidden />Published showcase</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{showcase}</div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionTable title="Queue depth" description="BullMQ counts per queue (−1 means the queue could not be reached).">
          <Table minWidth={520}>
            <THead><Tr><Th>Queue</Th><Th className="text-right">Waiting</Th><Th className="text-right">Active</Th><Th className="text-right">Delayed</Th><Th className="text-right">Failed</Th><Th className="text-right">Completed</Th></Tr></THead>
            <TBody>
              {queueRows.length === 0 ? <TableEmpty colSpan={6}>No queues reported.</TableEmpty> : queueRows.map(([name, c]) => (
                <Tr key={name}>
                  <Td className="font-medium">{name}</Td>
                  <Td className="text-right tabular-nums">{c.waiting}</Td>
                  <Td className="text-right tabular-nums">{c.active}</Td>
                  <Td className="text-right tabular-nums">{c.delayed}</Td>
                  <Td className={`text-right tabular-nums ${c.failed > 0 ? "text-danger" : ""}`}>{c.failed}</Td>
                  <Td className="text-right tabular-nums text-fg-muted">{c.completed}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </SectionTable>

        <SectionTable title="Jobs by tool" description="Last 30 days, grouped by status.">
          <Table minWidth={560}>
            <THead><Tr><Th>Tool</Th><Th className="text-right">Total</Th><Th>Statuses</Th></Tr></THead>
            <TBody>
              {toolRows.length === 0 ? <TableEmpty colSpan={3}>No jobs in the last 30 days.</TableEmpty> : toolRows.map(([slug, entry]) => (
                <Tr key={slug}>
                  <Td>
                    <Link href={`/admin/jobs?toolSlug=${slug}`} className="font-medium hover:text-accent hover:underline underline-offset-4">{getTool(slug)?.name ?? slug}</Link>
                  </Td>
                  <Td className="text-right tabular-nums">{entry.total.toLocaleString("en-US")}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(entry.statuses).sort((a, b) => b[1] - a[1]).map(([status, n]) => (
                        <Badge key={status} variant={status === "FAILED" ? "danger" : status === "COMPLETED" ? "success" : "default"}>{status.toLowerCase()} {n}</Badge>
                      ))}
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </SectionTable>
      </div>

      <SectionTable title="Latest jobs" description="Most recent 8 processing jobs." actions={<Button asChild variant="ghost" size="sm"><Link href="/admin/jobs">View all</Link></Button>}>
        <RecentJobs />
      </SectionTable>
    </div>
  );
}

async function RecentJobs() {
  const jobs = await prisma.processingJob.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { id: true, username: true } } } });
  return (
    <Table minWidth={640}>
      <THead><Tr><Th>Job</Th><Th>Tool</Th><Th>User</Th><Th>Status</Th><Th className="text-right">Credits</Th></Tr></THead>
      <TBody>
        {jobs.length === 0 ? <TableEmpty colSpan={5}>No jobs yet.</TableEmpty> : jobs.map((j) => (
          <Tr key={j.id}>
            <Td><Link href={`/admin/jobs/${j.id}`} className="font-mono text-xs hover:text-accent hover:underline underline-offset-4">{j.id.slice(0, 10)}…</Link></Td>
            <Td>{getTool(j.toolSlug)?.name ?? j.toolSlug}</Td>
            <Td><Link href={`/admin/users/${j.userId}`} className="hover:text-accent hover:underline underline-offset-4">{j.user.username}</Link></Td>
            <Td><StatusBadge status={j.status} /></Td>
            <Td className="text-right tabular-nums">{j.chargedCredits ?? j.estimatedCredits}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
