import Link from "next/link";
import { prisma, type Prisma } from "@modsmith/db";
import { ShieldAlert } from "lucide-react";
import { PageHeader, Pagination, EmptyState } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { StatusTabs } from "@/components/admin/status-tabs";
import { ReportActions } from "@/components/admin/moderation";
import { ResultCount } from "@/components/admin/table";
import { hrefWith, humanize, pageOf, PAGE_SIZE, skipTake, str, targetHref, type SearchParams } from "@/components/admin/helpers";
import { requireStaff } from "@/components/admin/guard";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const REASON_VARIANT: Record<string, "danger" | "warning" | "default"> = { copyright: "danger", inappropriate: "danger", spam: "warning", other: "default" };

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = pageOf(sp);
  const status = str(sp, "status") || "open";

  const where: Prisma.AbuseReportWhereInput = status === "all" ? {} : { status };
  const [total, reports, counts] = await Promise.all([
    prisma.abuseReport.count({ where }),
    prisma.abuseReport.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(page), include: { reporter: { select: { id: true, username: true } }, showcaseItem: { select: { id: true, slug: true, title: true, status: true } } } }),
    prisma.abuseReport.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countFor = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" description="Abuse reports raised by the community." />
      <StatusTabs current={status} hrefFor={(v) => hrefWith("/admin/reports", sp, { status: v, page: undefined })}
        tabs={[
          { value: "open", label: "Open", count: countFor("open") },
          { value: "resolved", label: "Resolved", count: countFor("resolved") },
          { value: "dismissed", label: "Dismissed", count: countFor("dismissed") },
          { value: "all", label: "All", count: counts.reduce((a, c) => a + c._count._all, 0) },
        ]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />

      {reports.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="Nothing to review" description={status === "open" ? "No open reports — the queue is clear." : "No reports in this state."} />
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-bg-elevated p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={REASON_VARIANT[r.reason] ?? "default"}>{humanize(r.reason)}</Badge>
                    <StatusBadge status={r.status} />
                    <Badge variant="outline">{r.targetType}</Badge>
                    <span className="text-xs text-fg-subtle" title={formatDateTime(r.createdAt)}>{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="text-sm">
                    <Link href={targetHref(r.targetType, r.targetId, r.showcaseItem?.slug)} className="font-medium text-fg hover:text-accent hover:underline underline-offset-4">
                      {r.showcaseItem?.title ?? `${humanize(r.targetType)} ${r.targetId.slice(0, 10)}…`}
                    </Link>
                    {r.showcaseItem ? <StatusBadge status={r.showcaseItem.status} className="ml-2" /> : null}
                  </p>
                  {r.details ? <p className="max-w-3xl whitespace-pre-wrap text-sm text-fg-muted">{r.details}</p> : null}
                  <p className="text-xs text-fg-subtle">
                    Reported by {r.reporter ? <Link href={`/admin/users/${r.reporter.id}`} className="hover:text-accent hover:underline">{r.reporter.username}</Link> : "an anonymous visitor"}
                    {r.resolvedAt ? ` · closed ${timeAgo(r.resolvedAt)}` : ""}
                  </p>
                </div>
                <ReportActions id={r.id} status={r.status} canHideTarget={!!r.showcaseItemId} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/reports", sp, { page: p })} />
    </div>
  );
}
