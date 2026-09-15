"use client";
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, Download, RotateCcw } from "lucide-react";
import { JOB_STAGES, JOB_STAGE_LABELS } from "@modsmith/core";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { useJob } from "@/hooks/use-job";
import { api } from "@/lib/api-client";

export function JobProgress({ jobId, creationId, onDone, compact, className }: { jobId: string; creationId?: string | null; onDone?: (status: string) => void; compact?: boolean; className?: string }) {
  const job = useJob(jobId);
  const notified = React.useRef(false);
  React.useEffect(() => { if (job?.done && !notified.current) { notified.current = true; onDone?.(job.status); } }, [job?.done, job?.status, onDone]);
  const stageIndex = job?.stage ? JOB_STAGES.indexOf(job.stage as (typeof JOB_STAGES)[number]) : -1;
  const [cancelling, setCancelling] = React.useState(false);

  const download = async () => {
    const r = await api<{ url: string }>(`/api/v1/jobs/${jobId}/download`);
    window.location.href = r.url;
  };

  if (!job) return <div className={cn("flex items-center gap-2 text-sm text-fg-muted", className)}><Loader2 className="h-4 w-4 animate-spin" /> Connecting to job…</div>;

  return (
    <div className={cn("rounded-lg border border-border bg-bg-elevated p-4", className)} aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {job.status === "COMPLETED" ? <CheckCircle2 className="h-5 w-5 text-success" /> : ["FAILED", "CANCELLED", "REFUNDED"].includes(job.status) ? <XCircle className="h-5 w-5 text-danger" /> : <Loader2 className="h-5 w-5 animate-spin text-accent" />}
          <div>
            <div className="text-sm font-medium">{job.status === "COMPLETED" ? "Build complete" : job.status === "FAILED" || job.status === "REFUNDED" ? "Build failed" : job.status === "CANCELLED" ? "Cancelled" : job.stage ? JOB_STAGE_LABELS[job.stage as keyof typeof JOB_STAGE_LABELS] ?? job.stage : "Queued"}</div>
            {job.message ? <div className="text-xs text-fg-muted">{job.message}</div> : null}
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>
      {!job.done ? <Progress value={job.progress} className="mt-3" aria-label="Job progress" /> : null}
      {!compact ? (
        <ol className="mt-4 grid grid-cols-2 gap-1 text-xs sm:grid-cols-5">
          {JOB_STAGES.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-1.5 rounded px-1.5 py-1", i < stageIndex || job.status === "COMPLETED" ? "text-success" : i === stageIndex && !job.done ? "text-accent" : "text-fg-subtle")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", i < stageIndex || job.status === "COMPLETED" ? "bg-success" : i === stageIndex && !job.done ? "bg-accent animate-pulse" : "bg-border-strong")} />
              {JOB_STAGE_LABELS[s]}
            </li>
          ))}
        </ol>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {job.status === "COMPLETED" ? (
          <>
            <Button size="sm" onClick={download}><Download /> Download ZIP</Button>
            {creationId ? <Button size="sm" variant="outline" asChild><Link href={`/app/creations/${creationId}`}>Open in My Creations</Link></Button> : null}
          </>
        ) : null}
        {!job.done ? <Button size="sm" variant="outline" loading={cancelling} onClick={async () => { setCancelling(true); try { await api(`/api/v1/jobs/${jobId}/cancel`, { method: "POST" }); } finally { setCancelling(false); } }}>Cancel</Button> : null}
        {["FAILED", "REFUNDED"].includes(job.status) ? <Button size="sm" variant="outline" asChild><Link href={`/app/jobs/${jobId}`}><RotateCcw /> View details</Link></Button> : null}
        <Button size="sm" variant="ghost" asChild><Link href={`/app/jobs/${jobId}`}>Job log</Link></Button>
      </div>
      <p className="mt-3 text-xs text-fg-subtle">You can leave this page — the build continues on our workers and you will be notified when it finishes.</p>
    </div>
  );
}
