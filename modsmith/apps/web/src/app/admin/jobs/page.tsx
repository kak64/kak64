import Link from "next/link";
import { prisma, type Prisma } from "@modsmith/db";
import { TOOLS, getTool } from "@modsmith/core";
import { PageHeader, Pagination } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { FilterBar } from "@/components/admin/filter-bar";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap, ResultCount } from "@/components/admin/table";
import { durationBetween, hrefWith, pageOf, PAGE_SIZE, skipTake, str, type SearchParams } from "@/components/admin/helpers";
import { requireStaff } from "@/components/admin/guard";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUSES = ["PENDING", "QUEUED", "PROCESSING", "PACKAGING", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED"] as const;

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = pageOf(sp);
  const status = str(sp, "status");
  const toolSlug = str(sp, "toolSlug");
  const userId = str(sp, "userId");
  const q = str(sp, "q");

  const where: Prisma.ProcessingJobWhereInput = {
    ...(status ? { status: status as Prisma.EnumJobStatusFilter["equals"] } : {}),
    ...(toolSlug ? { toolSlug } : {}),
    ...(userId ? { userId } : {}),
    ...(q ? { OR: [{ id: q }, { user: { username: { contains: q, mode: "insensitive" } } }] } : {}),
  };

  const [total, jobs, owner] = await Promise.all([
    prisma.processingJob.count({ where }),
    prisma.processingJob.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(page), include: { user: { select: { id: true, username: true } }, creation: { select: { id: true, name: true } } } }),
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { username: true } }) : null,
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Jobs" description={owner ? `Processing jobs for ${owner.username}.` : "Every processing job, newest first."} />
      <FilterBar fields={[
        { type: "search", name: "q", placeholder: "Job id or username…", label: "Search jobs" },
        { type: "select", name: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s.toLowerCase() })) },
        { type: "select", name: "toolSlug", label: "Tool", options: TOOLS.map((t) => ({ value: t.slug, label: t.name })) },
      ]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />
      <TableWrap>
        <Table minWidth={1000}>
          <THead><Tr><Th>Job</Th><Th>Tool</Th><Th>User</Th><Th>Creation</Th><Th>Status</Th><Th>Stage</Th><Th className="text-right">Credits</Th><Th className="text-right">Attempts</Th><Th>Duration</Th><Th>Created</Th></Tr></THead>
          <TBody>
            {jobs.length === 0 ? <TableEmpty colSpan={10}>No jobs match these filters.</TableEmpty> : jobs.map((j) => (
              <Tr key={j.id}>
                <Td><Link href={`/admin/jobs/${j.id}`} className="font-mono text-xs hover:text-accent hover:underline underline-offset-4">{j.id.slice(0, 10)}…</Link></Td>
                <Td className="whitespace-nowrap">{getTool(j.toolSlug)?.name ?? j.toolSlug}</Td>
                <Td><Link href={`/admin/users/${j.userId}`} className="hover:text-accent hover:underline underline-offset-4">{j.user.username}</Link></Td>
                <Td className="max-w-[180px] truncate text-fg-muted">{j.creation?.name ?? "—"}</Td>
                <Td><StatusBadge status={j.status} />{j.errorCode ? <div className="mt-0.5 text-[11px] text-danger">{j.errorCode}</div> : null}</Td>
                <Td className="text-fg-muted">{j.stage ?? "—"}{j.status === "PROCESSING" ? ` · ${j.progress}%` : ""}</Td>
                <Td className="text-right tabular-nums">{j.chargedCredits ?? j.estimatedCredits}</Td>
                <Td className="text-right tabular-nums text-fg-muted">{j.attempts}/{j.maxAttempts}</Td>
                <Td className="whitespace-nowrap text-fg-muted">{durationBetween(j.startedAt, j.finishedAt)}</Td>
                <Td className="whitespace-nowrap text-fg-muted" title={formatDateTime(j.createdAt)}>{timeAgo(j.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/jobs", sp, { page: p })} />
    </div>
  );
}
