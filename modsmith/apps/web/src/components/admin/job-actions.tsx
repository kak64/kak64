"use client";
import * as React from "react";
import { RefreshCw, Undo2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

/** Retry and manual refund for a job (ADMIN only). */
export function JobActions({ jobId, canRetry, refundable }: { jobId: string; canRetry: boolean; refundable: number }) {
  const { run, isBusy } = useAdminAction();
  const [retryOpen, setRetryOpen] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" disabled={!canRetry} loading={isBusy("retry")} onClick={() => setRetryOpen(true)}><RefreshCw />Retry</Button>
      <Button size="sm" variant="outline" disabled={refundable <= 0} loading={isBusy("refund")} onClick={() => setRefundOpen(true)}><Undo2 />Refund{refundable > 0 ? ` ${refundable}` : ""}</Button>

      <ConfirmDialog open={retryOpen} onOpenChange={setRetryOpen} title="Re-queue this job?"
        description="The job is put back on its queue. If the original charge was refunded, credits are held again."
        confirmLabel="Retry job" loading={isBusy("retry")}
        onConfirm={async () => { const r = await run("retry", () => api(`/api/v1/admin/jobs/${jobId}/retry`, { method: "POST" }), { success: "Job re-queued" }); if (r !== undefined) setRetryOpen(false); }} />

      <ConfirmDialog open={refundOpen} onOpenChange={setRefundOpen} destructive title={`Refund ${refundable} credits?`}
        description="Credits go back to the user's balance and a refund entry is written to the ledger. This cannot be undone."
        confirmLabel="Refund credits" loading={isBusy("refund")} disabled={reason.trim().length < 3}
        onConfirm={async () => { const r = await run("refund", () => api(`/api/v1/admin/jobs/${jobId}/refund`, { json: { reason: reason.trim() } }), { success: "Refund issued" }); if (r !== undefined) { setRefundOpen(false); setReason(""); } }}>
        <Field label="Reason" htmlFor="refund-reason" hint="Recorded on the refund and in the audit log (3–300 characters).">
          <Textarea id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Output was unusable — packaging bug" />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
