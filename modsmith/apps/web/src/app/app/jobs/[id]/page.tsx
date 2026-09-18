import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Box, Coins } from "lucide-react";
import { prisma } from "@modsmith/db";
import { JOB_STAGE_LABELS, TOOL_BY_SLUG } from "@modsmith/core";
import { getCurrentUser } from "@/server/session";
import { cn, formatBytes, formatCredits, formatDateTime } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { JobLiveProgress } from "@/components/app/jobs/job-detail-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Job ${id.slice(-8)}` };
}

const LEVEL_COLORS: Record<string, string> = { debug: "text-fg-subtle", info: "text-info", warn: "text-warning", error: "text-danger", fatal: "text-danger" };

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await getCurrentUser())!;
  const { id } = await params;
  const job = await prisma.processingJob.findFirst({ where: { id, userId: user.id }, include: { events: { orderBy: { createdAt: "asc" }, take: 300 }, creation: { select: { id: true, name: true } }, exportCharge: { include: { refunds: true } } } });
  if (!job) notFound();
  const tool = TOOL_BY_SLUG[job.toolSlug];
  const refunded = job.exportCharge?.refunds ?? [];
  const refundedCredits = refunded.reduce((a, r) => a + r.credits, 0);
  const active = ["PENDING", "QUEUED", "PROCESSING", "PACKAGING"].includes(job.status);

  return (
    <div className="space-y-6">
      <Link href="/app/jobs" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden /> Jobs</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tool?.name ?? job.toolSlug}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted"><span className="font-mono text-xs">{job.id}</span><StatusBadge status={job.status} />{job.isFreeReexport ? <Badge variant="success">free re-export</Badge> : null}</p>
        </div>
        {job.creation ? <Button variant="outline" size="sm" asChild><Link href={`/app/creations/${job.creation.id}`}><Box /> {job.creation.name}</Link></Button> : null}
      </div>

      <JobLiveProgress jobId={job.id} creationId={job.creationId} />

      {job.errorMessage && !active ? <Alert variant="danger" title={job.errorCode ?? "Build failed"}>{job.errorMessage}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Coins className="h-4 w-4 text-accent" aria-hidden /> Credits</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="divide-y divide-border">
              <div className="flex justify-between py-2"><dt className="text-fg-muted">Estimated</dt><dd className="font-medium tabular-nums">{formatCredits(job.estimatedCredits)}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-fg-muted">Charged</dt><dd className="font-medium tabular-nums">{job.isFreeReexport ? <span className="text-success">free</span> : formatCredits(job.chargedCredits ?? 0)}</dd></div>
              {refundedCredits ? <div className="flex justify-between py-2"><dt className="text-fg-muted">Refunded</dt><dd className="font-medium tabular-nums text-success">+{formatCredits(refundedCredits)}</dd></div> : null}
              <div className="flex justify-between py-2"><dt className="text-fg-muted">Started</dt><dd>{formatDateTime(job.createdAt)}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-fg-muted">Finished</dt><dd>{job.finishedAt ? formatDateTime(job.finishedAt) : "—"}</dd></div>
              {job.resultSize ? <div className="flex justify-between py-2"><dt className="text-fg-muted">Result size</dt><dd className="tabular-nums">{formatBytes(job.resultSize)}</dd></div> : null}
            </dl>
            <p className="rounded-md border border-border bg-bg-muted p-2 text-xs text-fg-muted">
              {active ? "Credits are held while the job runs and only settle when the build completes." : refundedCredits ? "This build did not complete, so the held credits were returned to your balance." : job.status === "COMPLETED" ? "Credits were charged because the build completed successfully." : "No credits were charged for this job."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild><Link href="/app/credits">Credit ledger</Link></Button>
              {job.creationId ? <Button variant="ghost" size="sm" asChild><Link href={`/app/creations/${job.creationId}`}>Open creation</Link></Button> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Event log</CardTitle></CardHeader>
          <CardContent>
            {job.events.length ? (
              <ol className="relative space-y-3 border-l border-border pl-4">
                {job.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className={cn("absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full", e.level === "error" || e.level === "fatal" ? "bg-danger" : e.level === "warn" ? "bg-warning" : "bg-border-strong")} aria-hidden />
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                      <time className="font-mono text-xs text-fg-subtle" dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt)}</time>
                      <span className={cn("text-xs font-medium uppercase", LEVEL_COLORS[e.level] ?? "text-fg-muted")}>{e.level}</span>
                      {e.stage ? <span className="text-xs text-fg-muted">{JOB_STAGE_LABELS[e.stage as keyof typeof JOB_STAGE_LABELS] ?? e.stage}</span> : null}
                      {e.progress != null ? <span className="text-xs tabular-nums text-fg-subtle">{e.progress}%</span> : null}
                    </div>
                    {e.message ? <p className="mt-0.5 text-sm text-fg">{e.message}</p> : null}
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-fg-muted">No events recorded yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
