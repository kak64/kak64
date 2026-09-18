"use client";
import { useRouter } from "next/navigation";
import { JobProgress } from "@/components/shared/job-progress";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useApiAction } from "../hooks";
import { CreationActions } from "./creation-actions";
import type { CreationRow } from "./types";

export function CreationLiveJob({ jobId, creationId }: { jobId: string; creationId: string }) {
  const router = useRouter();
  return <JobProgress jobId={jobId} creationId={creationId} onDone={() => router.refresh()} />;
}

export function CreationDetailActions({ creation }: { creation: CreationRow }) {
  const router = useRouter();
  const { run, isBusy } = useApiAction();
  return (
    <div className="flex items-center gap-2">
      {creation.currentVersion ? <Button size="sm" loading={isBusy("dl")} onClick={() => run("dl", async () => { const r = await api<{ url: string }>(`/api/v1/creations/${creation.id}/download`); window.location.href = r.url; })}><Download /> Download</Button> : null}
      <CreationActions creation={creation} showOpen={false} triggerVariant="outline" afterDelete={() => router.push("/app/creations")} />
    </div>
  );
}

export function VersionDownload({ creationId, version }: { creationId: string; version: number }) {
  const { run, isBusy } = useApiAction();
  return <Button variant="ghost" size="sm" loading={isBusy(`v${version}`)} onClick={() => run(`v${version}`, async () => { const r = await api<{ url: string }>(`/api/v1/creations/${creationId}/download?version=${version}`); window.location.href = r.url; })}><Download /> Download</Button>;
}
