"use client";
import * as React from "react";
import { ExternalLink } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiAction } from "../hooks";

export function PortalButton({ disabled }: { disabled?: boolean }) {
  const { run, isBusy } = useApiAction();
  return (
    <Button variant="outline" size="sm" disabled={disabled} loading={isBusy("portal")} onClick={() => run("portal", async () => { const r = await api<{ url: string }>("/api/v1/billing/portal", { method: "POST" }); window.location.href = r.url; })}>
      <ExternalLink /> Manage in Stripe portal
    </Button>
  );
}

/** Cancel-at-period-end / resume with a confirmation dialog. */
export function SubscriptionToggle({ subscriptionId, planName, cancelAtPeriodEnd, periodEnd, disabled }: { subscriptionId: string; planName: string; cancelAtPeriodEnd: boolean; periodEnd: string | null; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const { run, isBusy } = useApiAction();
  const action = cancelAtPeriodEnd ? "resume" : "cancel";
  const go = async () => {
    const r = await run(action, () => api(`/api/v1/billing/subscriptions/${subscriptionId}/${action}`, { method: "POST" }), { success: cancelAtPeriodEnd ? "Subscription resumed" : "Subscription will end at the period end", refresh: true });
    if (r !== undefined) setOpen(false);
  };
  return (
    <>
      <Button variant={cancelAtPeriodEnd ? "default" : "outline"} size="sm" disabled={disabled} onClick={() => setOpen(true)}>{cancelAtPeriodEnd ? "Resume subscription" : "Cancel subscription"}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{cancelAtPeriodEnd ? `Resume ${planName}?` : `Cancel ${planName}?`}</DialogTitle>
            <DialogDescription>
              {cancelAtPeriodEnd
                ? "Billing continues as normal and your plan benefits stay active."
                : `Your plan stays active until ${periodEnd ? new Date(periodEnd).toLocaleDateString("en-US", { dateStyle: "medium" } as Intl.DateTimeFormatOptions) : "the end of the current period"}. Credits you already have are never removed.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Keep as is</Button><Button variant={cancelAtPeriodEnd ? "default" : "destructive"} loading={isBusy(action)} onClick={go}>{cancelAtPeriodEnd ? "Resume" : "Cancel subscription"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
