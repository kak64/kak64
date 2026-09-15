import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@modsmith/db";
import { getTool } from "@modsmith/core";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { Section, SectionTable } from "@/components/admin/section";
import { KeyValue, Table, TBody, Td, Th, THead, Tr, TableEmpty } from "@/components/admin/table";
import { JsonViewer } from "@/components/admin/json-viewer";
import { JobActions } from "@/components/admin/job-actions";
import { requireStaff } from "@/components/admin/guard";
import { durationBetween } from "@/components/admin/helpers";
import { formatBytes, formatCredits, formatDateTime, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Job", robots: { index: false, follow: false } };

const LEVEL_COLOR: Record<string, string> = { error: "text-danger", warn: "text-warning", info: "text-fg-muted", debug: "text-fg-subtle" };

export default async function AdminJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const job = await prisma.processingJob.findUnique({
    where: { id },
    include: {
      events: { orderBy: { createdAt: "asc" } },
      user: { select: { id: true, username: true, email: true } },
      creation: { select: { id: true, name: true } },
      upload: { select: { id: true, originalName: true, sizeBytes: true, status: true } },
      exportCharge: { include: { refunds: true } },
    },
  });
  if (!job) notFound();

  const charged = job.chargedCredits ?? 0;
  const refunded = job.exportCharge?.refunds.reduce((a, r) => a + r.credits, 0) ?? 0;
  const refundable = Math.max(0, charged - refunded);
  const tool = getTool(job.toolSlug);

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/admin/jobs"><ArrowLeft />All jobs</Link></Button>
      <PageHeader
        title={`${tool?.name ?? job.toolSlug} job`}
        description={job.id}
        actions={staff.role === "ADMIN" ? <JobActions jobId={job.id} canRetry={job.status === "FAILED" || job.status === "REFUNDED"} refundable={refundable} /> : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={job.status} />
        {job.stage ? <Badge variant="outline">{job.stage}</Badge> : null}
        {job.isFreeReexport ? <Badge variant="info">free re-export</Badge> : null}
        {job.errorCode ? <Badge variant="danger">{job.errorCode}</Badge> : null}
      </div>
      {job.status === "PROCESSING" || job.status === "PACKAGING" ? <Progress value={job.progress} aria-label="Job progress" /> : null}
      {job.errorMessage ? <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{job.errorMessage}</div> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section title="Job" className="xl:col-span-2">
          <KeyValue items={[
            { label: "Job id", value: <span className="font-mono text-xs">{job.id}</span> },
            { label: "Queue job id", value: job.queueJobId ? <span className="font-mono text-xs">{job.queueJobId}</span> : "—" },
            { label: "Processor", value: job.processor },
            { label: "Tool", value: tool?.name ?? job.toolSlug },
            { label: "User", value: <Link href={`/admin/users/${job.userId}`} className="hover:text-accent hover:underline">{job.user.username}</Link> },
            { label: "Creation", value: job.creation ? <Link href={`/admin/creations?q=${encodeURIComponent(job.creation.name)}`} className="hover:text-accent hover:underline">{job.creation.name}</Link> : "—" },
            { label: "Upload", value: job.upload ? `${job.upload.originalName} (${formatBytes(job.upload.sizeBytes)})` : "—" },
            { label: "Attempts", value: `${job.attempts} of ${job.maxAttempts}` },
            { label: "Priority", value: job.priority },
            { label: "Created", value: formatDateTime(job.createdAt) },
            { label: "Started", value: job.startedAt ? formatDateTime(job.startedAt) : "—" },
            { label: "Finished", value: job.finishedAt ? formatDateTime(job.finishedAt) : "—" },
            { label: "Duration", value: durationBetween(job.startedAt, job.finishedAt) },
            { label: "Source hash", value: job.sourceHash ? <span className="font-mono text-xs">{job.sourceHash.slice(0, 16)}…</span> : "—" },
            { label: "Config hash", value: job.configHash ? <span className="font-mono text-xs">{job.configHash.slice(0, 16)}…</span> : "—" },
          ]} />
        </Section>

        <Section title="Credits & result">
          <KeyValue className="sm:grid-cols-1" items={[
            { label: "Estimated", value: <span className="tabular-nums">{formatCredits(job.estimatedCredits)}</span> },
            { label: "Charged", value: <span className="tabular-nums">{formatCredits(charged)}</span> },
            { label: "Refunded", value: <span className="tabular-nums">{formatCredits(refunded)}</span> },
            { label: "Refundable", value: <span className="tabular-nums font-semibold">{formatCredits(refundable)}</span> },
            { label: "Result", value: job.resultName ?? "—" },
            { label: "Result size", value: job.resultSize ? formatBytes(job.resultSize) : "—" },
          ]} />
          {job.exportCharge?.refunds.length ? (
            <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
              {job.exportCharge.refunds.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-fg-muted" title={r.reason}>{r.reason}</span>
                  <span className="shrink-0 tabular-nums text-warning">−{formatCredits(r.credits)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      </div>

      <SectionTable title="Event timeline" description={`${job.events.length} recorded event${job.events.length === 1 ? "" : "s"}.`}>
        <Table minWidth={700}>
          <THead><Tr><Th>When</Th><Th>Status</Th><Th>Stage</Th><Th className="text-right">Progress</Th><Th>Message</Th></Tr></THead>
          <TBody>
            {job.events.length === 0 ? <TableEmpty colSpan={5}>No events recorded for this job.</TableEmpty> : job.events.map((e) => (
              <Tr key={e.id}>
                <Td className="whitespace-nowrap text-fg-muted" title={formatDateTime(e.createdAt)}>{timeAgo(e.createdAt)}</Td>
                <Td>{e.status ? <StatusBadge status={e.status} /> : "—"}</Td>
                <Td className="text-fg-muted">{e.stage ?? "—"}</Td>
                <Td className="text-right tabular-nums text-fg-muted">{e.progress ?? "—"}</Td>
                <Td className={LEVEL_COLOR[e.level] ?? "text-fg-muted"}>{e.message ?? "—"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </SectionTable>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <JsonViewer label="Input" value={job.input} />
        <JsonViewer label="Config" value={job.config} />
        <JsonViewer label="Result manifest" value={job.resultManifest} />
      </div>
    </div>
  );
}
