"use client";
import * as React from "react";
import { Check, EyeOff, Star, Trash2, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

type ShowcaseStatus = "PUBLISHED" | "HIDDEN" | "REMOVED";

/** Publish / hide / remove / feature a showcase item. */
export function ShowcaseActions({ id, status, featured }: { id: string; status: ShowcaseStatus; featured: boolean }) {
  const { run, isBusy } = useAdminAction();
  const [remove, setRemove] = React.useState(false);
  const patch = (json: Record<string, unknown>, success: string) => run(id, () => api(`/api/v1/admin/showcase/${id}`, { method: "PATCH", json }), { success });

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button size="sm" variant="ghost" loading={isBusy(id)} aria-pressed={featured} title={featured ? "Unfeature" : "Feature"}
        onClick={() => void patch({ featured: !featured }, featured ? "Removed from featured" : "Featured")}>
        <Star className={featured ? "text-accent" : undefined} />{featured ? "Unfeature" : "Feature"}
      </Button>
      {status === "PUBLISHED" ? (
        <Button size="sm" variant="outline" loading={isBusy(id)} onClick={() => void patch({ status: "HIDDEN" }, "Item hidden")}><EyeOff />Hide</Button>
      ) : (
        <Button size="sm" variant="outline" loading={isBusy(id)} onClick={() => void patch({ status: "PUBLISHED" }, "Item published")}><Check />Publish</Button>
      )}
      {status !== "REMOVED" ? (
        <Button size="sm" variant="ghost" loading={isBusy(id)} onClick={() => setRemove(true)}><Trash2 className="text-danger" />Remove</Button>
      ) : null}
      <ConfirmDialog open={remove} onOpenChange={setRemove} destructive title="Remove this showcase item?"
        description="The item is taken off the public showcase and its creation is made private. The creation itself is not deleted."
        confirmLabel="Remove item" loading={isBusy(id)}
        onConfirm={async () => { const r = await patch({ status: "REMOVED" }, "Item removed"); if (r !== undefined) setRemove(false); }} />
    </div>
  );
}

/** Approve / reject / hide / delete a review. */
export function ReviewActions({ id, status }: { id: string; status: string }) {
  const { run, isBusy } = useAdminAction();
  const [del, setDel] = React.useState(false);
  const patch = (next: string, success: string) => run(id, () => api(`/api/v1/admin/reviews/${id}`, { method: "PATCH", json: { status: next } }), { success });

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {status !== "APPROVED" ? <Button size="sm" variant="outline" loading={isBusy(id)} onClick={() => void patch("APPROVED", "Review approved")}><Check />Approve</Button> : null}
      {status !== "REJECTED" ? <Button size="sm" variant="ghost" loading={isBusy(id)} onClick={() => void patch("REJECTED", "Review rejected")}><X />Reject</Button> : null}
      {status !== "HIDDEN" ? <Button size="sm" variant="ghost" loading={isBusy(id)} onClick={() => void patch("HIDDEN", "Review hidden")}><EyeOff />Hide</Button> : null}
      <Button size="icon-sm" variant="ghost" aria-label="Delete review" loading={isBusy(id)} onClick={() => setDel(true)}><Trash2 className="text-danger" /></Button>
      <ConfirmDialog open={del} onOpenChange={setDel} destructive title="Delete this review?"
        description="The review is permanently removed. Prefer hiding if you may need it later."
        confirmLabel="Delete review" loading={isBusy(id)}
        onConfirm={async () => { const r = await run(id, () => api(`/api/v1/admin/reviews/${id}`, { method: "DELETE" }), { success: "Review deleted" }); if (r !== undefined) setDel(false); }} />
    </div>
  );
}

/** Resolve or dismiss an abuse report, optionally hiding the reported showcase item. */
export function ReportActions({ id, canHideTarget, status }: { id: string; canHideTarget: boolean; status: string }) {
  const { run, isBusy } = useAdminAction();
  const [open, setOpen] = React.useState<null | "resolved" | "dismissed">(null);
  const [hideTarget, setHideTarget] = React.useState(false);

  const submit = async (next: "resolved" | "dismissed") => {
    const r = await run(id, () => api(`/api/v1/admin/reports/${id}`, { method: "PATCH", json: { status: next, hideTarget: next === "resolved" ? hideTarget : false } }), { success: next === "resolved" ? "Report resolved" : "Report dismissed" });
    if (r !== undefined) { setOpen(null); setHideTarget(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {status !== "resolved" ? <Button size="sm" variant="outline" loading={isBusy(id)} onClick={() => setOpen("resolved")}><Check />Resolve</Button> : null}
      {status !== "dismissed" ? <Button size="sm" variant="ghost" loading={isBusy(id)} onClick={() => setOpen("dismissed")}><X />Dismiss</Button> : null}

      <ConfirmDialog open={open === "resolved"} onOpenChange={() => setOpen(null)} title="Resolve this report?"
        description="Marks the report as actioned and records you as the resolver." confirmLabel="Resolve" loading={isBusy(id)}
        onConfirm={() => submit("resolved")}>
        {canHideTarget ? (
          <div className="flex items-start gap-2 rounded-md border border-border bg-bg-muted/40 px-3 py-2">
            <Checkbox id={`hide-${id}`} checked={hideTarget} onCheckedChange={(v) => setHideTarget(v === true)} />
            <Label htmlFor={`hide-${id}`} className="text-sm font-normal">
              Hide the reported showcase item
              <span className="mt-0.5 block text-xs text-fg-muted">The item leaves the public showcase and its creation becomes private.</span>
            </Label>
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog open={open === "dismissed"} onOpenChange={() => setOpen(null)} title="Dismiss this report?"
        description="No action is taken against the target. The report is closed." confirmLabel="Dismiss" loading={isBusy(id)}
        onConfirm={() => submit("dismissed")} />
    </div>
  );
}
