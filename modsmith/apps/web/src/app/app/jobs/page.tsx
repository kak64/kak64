import type { Metadata } from "next";
import { prisma, type Prisma, type JobStatus } from "@modsmith/db";
import { getCurrentUser } from "@/server/session";
import { PageHeader } from "@/components/ui/misc";
import { JobsTable, type JobRow } from "@/components/app/jobs/jobs-table";

export const metadata: Metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUSES = ["PENDING", "QUEUED", "PROCESSING", "PACKAGING", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED"] as const;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const statusParam = first(sp.status);
  const status = STATUSES.includes(statusParam as (typeof STATUSES)[number]) ? (statusParam as JobStatus) : undefined;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const where: Prisma.ProcessingJobWhereInput = { userId: user.id, ...(status ? { status } : {}) };
  const [total, jobs] = await Promise.all([
    prisma.processingJob.count({ where }),
    prisma.processingJob.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, toolSlug: true, status: true, stage: true, progress: true, creationId: true, chargedCredits: true, isFreeReexport: true, errorMessage: true, createdAt: true, finishedAt: true, creation: { select: { name: true } } } }),
  ]);
  const rows: JobRow[] = jobs.map((j) => ({ id: j.id, toolSlug: j.toolSlug, status: j.status, stage: j.stage, progress: j.progress, creationId: j.creationId, creationName: j.creation?.name ?? null, chargedCredits: j.chargedCredits, isFreeReexport: j.isFreeReexport, errorMessage: j.errorMessage, createdAt: j.createdAt.toISOString(), finishedAt: j.finishedAt?.toISOString() ?? null }));
  return (
    <div>
      <PageHeader title="Jobs" description="Live progress, credits and logs for every export you've started." />
      <JobsTable jobs={rows} total={total} page={page} pageSize={PAGE_SIZE} status={status ?? ""} />
    </div>
  );
}
