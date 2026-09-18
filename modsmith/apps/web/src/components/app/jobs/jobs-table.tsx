"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ListChecks, XCircle } from "lucide-react";
import { JOB_STAGE_LABELS, TOOL_BY_SLUG } from "@modsmith/core";
import { api } from "@/lib/api-client";
import { cn, formatCredits, formatDateTime, timeAgo } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { EmptyState, Pagination } from "@/components/ui/misc";
import { useJob } from "@/hooks/use-job";
import { useApiAction } from "../hooks";

export interface JobRow {
  id: string; toolSlug: string; status: string; stage: string | null; progress: number;
  creationId: string | null; creationName: string | null; chargedCredits: number | null; isFreeReexport: boolean;
  errorMessage: string | null; createdAt: string; finishedAt: string | null;
}

const ACTIVE = ["PENDING", "QUEUED", "PROCESSING", "PACKAGING"];
const STATUSES = ["PENDING", "QUEUED", "PROCESSING", "PACKAGING", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED"];

function stageLabel(stage: string | null) {
  if (!stage) return "—";
  return JOB_STAGE_LABELS[stage as keyof typeof JOB_STAGE_LABELS] ?? stage;
}

/** Live progress cell: subscribes to the job stream while the job is running. */
function LiveCell({ job }: { job: JobRow }) {
  const live = useJob(ACTIVE.includes(job.status) ? job.id : null);
  const status = live?.status ?? job.status;
  const stage = live?.stage ?? job.stage;
  const progress = live?.progress ?? job.progress;
  const router = useRouter();
  const done = React.useRef(false);
  React.useEffect(() => { if (live?.done && !done.current) { done.current = true; router.refresh(); } }, [live?.done, router]);
  return (
    <div className="min-w-[8rem]">
      <div className="flex items-center gap-2"><StatusBadge status={status} />{job.isFreeReexport ? <Badge variant="success">free re-export</Badge> : null}</div>
      {ACTIVE.includes(status) ? <><Progress value={progress} className="mt-1.5 h-1.5" aria-label={`Progress for ${job.id}`} /><span className="text-xs text-fg-muted">{stageLabel(stage)} · {progress}%</span></> : null}
    </div>
  );
}

function CancelButton({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const { run, isBusy } = useApiAction();
  return <Button variant="ghost" size="sm" loading={isBusy(jobId)} onClick={() => run(jobId, () => api(`/api/v1/jobs/${jobId}/cancel`, { method: "POST" }), { success: "Job cancelled", refresh: true }).then(onDone)}><XCircle /> Cancel</Button>;
}

export function JobsTable({ jobs, total, page, pageSize, status }: { jobs: JobRow[]; total: number; page: number; pageSize: number; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const hrefFor = (p: number, s = status) => { const sp = new URLSearchParams(); if (s) sp.set("status", s); if (p > 1) sp.set("page", String(p)); const q = sp.toString(); return q ? `${pathname}?${q}` : pathname; };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <NativeSelect aria-label="Filter by status" value={status} onChange={(e) => router.push(hrefFor(1, e.target.value))} className="w-48"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</NativeSelect>
        {status ? <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>Clear</Button> : null}
      </div>
      {jobs.length === 0 ? (
        <EmptyState icon={ListChecks} title={status ? "No jobs with this status" : "No jobs yet"} description={status ? "Try a different status filter." : "Every export you start shows up here with live progress, credits and logs."} action={status ? { label: "Clear filter", href: pathname } : { label: "Browse tools", href: "/app/tools" }} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-bg-elevated md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Your processing jobs</caption>
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle"><th scope="col" className="px-3 py-2">Tool</th><th scope="col" className="px-3 py-2">Creation</th><th scope="col" className="px-3 py-2">Status</th><th scope="col" className="px-3 py-2">Credits</th><th scope="col" className="px-3 py-2">Started</th><th scope="col" className="px-3 py-2">Finished</th><th scope="col" className="px-3 py-2"></th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-3 py-2.5"><Link href={`/app/jobs/${j.id}`} className="font-medium hover:text-accent">{TOOL_BY_SLUG[j.toolSlug]?.name ?? j.toolSlug}</Link>{j.errorMessage ? <div className="mt-0.5 max-w-[16rem] truncate text-xs text-danger" title={j.errorMessage}>{j.errorMessage}</div> : null}</td>
                    <td className="px-3 py-2.5">{j.creationId ? <Link href={`/app/creations/${j.creationId}`} className="hover:text-accent">{j.creationName ?? "Creation"}</Link> : <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-3 py-2.5"><LiveCell job={j} /></td>
                    <td className="px-3 py-2.5 tabular-nums">{j.isFreeReexport ? <span className="text-success">free re-export</span> : j.chargedCredits ? formatCredits(j.chargedCredits) : <span className="text-fg-subtle">0</span>}</td>
                    <td className="px-3 py-2.5 text-fg-muted">{timeAgo(j.createdAt)}</td>
                    <td className="px-3 py-2.5 text-fg-muted">{j.finishedAt ? timeAgo(j.finishedAt) : "—"}</td>
                    <td className="px-3 py-2.5 text-right"><div className="flex justify-end gap-1">{ACTIVE.includes(j.status) ? <CancelButton jobId={j.id} onDone={() => router.refresh()} /> : null}<Button variant="ghost" size="sm" asChild><Link href={`/app/jobs/${j.id}`}>Details</Link></Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {jobs.map((j) => (
              <li key={j.id} className={cn("rounded-lg border border-border bg-bg-elevated p-3")}>
                <div className="flex items-start justify-between gap-2"><Link href={`/app/jobs/${j.id}`} className="font-medium hover:text-accent">{TOOL_BY_SLUG[j.toolSlug]?.name ?? j.toolSlug}</Link><LiveCell job={j} /></div>
                {j.creationId ? <Link href={`/app/creations/${j.creationId}`} className="mt-1 block truncate text-sm text-fg-muted hover:text-accent">{j.creationName ?? "Creation"}</Link> : null}
                {j.errorMessage ? <p className="mt-1 text-xs text-danger">{j.errorMessage}</p> : null}
                <div className="mt-2 flex items-center justify-between text-xs text-fg-muted"><span>{j.isFreeReexport ? "Free re-export" : `${formatCredits(j.chargedCredits ?? 0)} credits`}</span><span>{formatDateTime(j.createdAt)}</span></div>
                <div className="mt-2 flex gap-2">{ACTIVE.includes(j.status) ? <CancelButton jobId={j.id} onDone={() => router.refresh()} /> : null}<Button variant="outline" size="sm" asChild><Link href={`/app/jobs/${j.id}`}>Details</Link></Button></div>
              </li>
            ))}
          </ul>
        </>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => hrefFor(p)} />
    </div>
  );
}
