"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JobProgress } from "@/components/shared/job-progress";

export interface ActiveJobItem { id: string; toolName: string; creationId: string | null; creationName: string | null; createdAt: string }

/** Compact live progress cards for running jobs; refreshes the dashboard when one finishes. */
export function ActiveJobs({ jobs }: { jobs: ActiveJobItem[] }) {
  const router = useRouter();
  return (
    <ul className="space-y-3">
      {jobs.map((j) => (
        <li key={j.id}>
          <div className="mb-1 flex items-center justify-between text-xs text-fg-muted">
            <span className="truncate"><span className="font-medium text-fg">{j.toolName}</span>{j.creationName ? ` · ${j.creationName}` : ""}</span>
            <Link href={`/app/jobs/${j.id}`} className="text-accent hover:underline">Details</Link>
          </div>
          <JobProgress jobId={j.id} creationId={j.creationId} compact onDone={() => router.refresh()} />
        </li>
      ))}
    </ul>
  );
}
