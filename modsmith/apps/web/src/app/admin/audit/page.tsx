import Link from "next/link";
import { prisma, type Prisma } from "@modsmith/db";
import { PageHeader, Pagination, EmptyState } from "@/components/ui/misc";
import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/admin/filter-bar";
import { JsonViewer } from "@/components/admin/json-viewer";
import { ResultCount } from "@/components/admin/table";
import { hrefWith, pageOf, PAGE_SIZE, skipTake, str, targetHref, type SearchParams } from "@/components/admin/helpers";
import { requireAdmin } from "@/components/admin/guard";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ACTION_PREFIXES = ["admin.user", "admin.credits", "admin.job", "admin.tool", "admin.setting", "admin.flag", "admin.review", "admin.showcase", "admin.report", "admin.guide", "admin.changelog", "admin.partner", "admin.creditPack", "admin.subscriptionPlan", "admin.hubMedia", "job", "auth"];

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = pageOf(sp);
  const action = str(sp, "action");
  const actor = str(sp, "actor");
  const targetId = str(sp, "targetId");

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action: { startsWith: action } } : {}),
    ...(targetId ? { targetId } : {}),
    ...(actor ? { OR: [{ actorId: actor }, { actor: { username: { contains: actor, mode: "insensitive" } } }] } : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(page), include: { actor: { select: { id: true, username: true } } } }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" description="Every privileged action, with the before and after state where available." />
      <FilterBar fields={[
        { type: "search", name: "actor", placeholder: "Actor username or id…", label: "Filter by actor" },
        { type: "search", name: "targetId", placeholder: "Target id…", label: "Filter by target" },
        { type: "select", name: "action", label: "Action", allLabel: "All actions", options: ACTION_PREFIXES.map((a) => ({ value: a, label: a })) },
      ]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />

      {logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit entries" description="Nothing matches these filters yet." />
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li key={log.id} className="rounded-lg border border-border bg-bg-elevated p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={log.action.startsWith("admin.") ? "accent" : "outline"}>{log.action}</Badge>
                <span className="text-fg-muted">
                  {log.actor ? <Link href={`/admin/users/${log.actor.id}`} className="hover:text-accent hover:underline">{log.actor.username}</Link> : log.actorType}
                </span>
                {log.targetType ? (
                  <span className="text-fg-subtle">
                    →{" "}
                    {log.targetId ? (
                      <Link href={targetHref(log.targetType, log.targetId)} className="font-mono hover:text-accent hover:underline">{log.targetType}:{log.targetId.slice(0, 10)}…</Link>
                    ) : log.targetType}
                  </span>
                ) : null}
                <span className="ml-auto text-fg-subtle" title={formatDateTime(log.createdAt)}>{timeAgo(log.createdAt)}</span>
              </div>
              {log.before || log.after ? (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {log.before ? <JsonViewer label="Before" value={log.before} maxHeight={220} /> : null}
                  {log.after ? <JsonViewer label="After" value={log.after} maxHeight={220} /> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/audit", sp, { page: p })} />
    </div>
  );
}
