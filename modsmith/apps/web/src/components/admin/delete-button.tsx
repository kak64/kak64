"use client";
import * as React from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

/** Generic audited DELETE with a confirm dialog and toast. */
export function DeleteButton({ endpoint, title, description, confirmLabel = "Delete", success, label, size = "icon-sm", variant = "ghost", redirectTo }: {
  endpoint: string;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  success?: string;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  redirectTo?: string;
}) {
  const { run, isBusy } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" size={size} variant={variant} aria-label={label ? undefined : title} onClick={() => setOpen(true)}>
        <Trash2 className={variant === "destructive" ? undefined : "text-danger"} />{label}
      </Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} destructive title={title} description={description} confirmLabel={confirmLabel} loading={isBusy("delete")}
        onConfirm={async () => {
          const res = await run("delete", async () => {
            await api(endpoint, { method: "DELETE" });
            if (redirectTo) window.location.href = redirectTo;
          }, { success: success ?? "Deleted" });
          if (res !== undefined) setOpen(false);
        }} />
    </>
  );
}
