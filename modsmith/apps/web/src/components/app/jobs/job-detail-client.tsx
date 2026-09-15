"use client";
import { useRouter } from "next/navigation";
import { JobProgress } from "@/components/shared/job-progress";

/** Full live progress for a job; refreshes the server-rendered log when it finishes. */
export function JobLiveProgress({ jobId, creationId }: { jobId: string; creationId: string | null }) {
  const router = useRouter();
  return <JobProgress jobId={jobId} creationId={creationId} onDone={() => router.refresh()} />;
}
