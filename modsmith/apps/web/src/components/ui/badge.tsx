import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", {
  variants: {
    variant: {
      default: "border-border bg-bg-subtle text-fg-muted",
      accent: "border-accent/30 bg-accent-soft text-accent",
      success: "border-success/30 bg-success/10 text-success",
      warning: "border-warning/30 bg-warning/10 text-warning",
      danger: "border-danger/30 bg-danger/10 text-danger",
      info: "border-info/30 bg-info/10 text-info",
      outline: "border-border-strong text-fg",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  PENDING: "default", QUEUED: "info", PROCESSING: "accent", PACKAGING: "accent", COMPLETED: "success", FAILED: "danger", CANCELLED: "default", REFUNDED: "warning",
  DRAFT: "default", READY: "success", ARCHIVED: "default",
  ACTIVE: "success", SUSPENDED: "danger", DELETED: "default", TRIALING: "info", PAST_DUE: "warning", CANCELED: "default", UNPAID: "danger", INCOMPLETE: "default", EXPIRED: "default",
  PAID: "success", APPROVED: "success", REJECTED: "danger", HIDDEN: "default", PUBLISHED: "success", REMOVED: "danger",
  live: "success", beta: "info", new: "accent", coming_soon: "default", maintenance: "warning",
  DEBUG: "default", INFO: "info", WARN: "warning", ERROR: "danger", FATAL: "danger",
  UPLOADED: "success", VALIDATED: "success", UPLOADING: "info",
};

function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge variant={STATUS_VARIANTS[status] ?? "default"} className={className}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

export { Badge, badgeVariants, StatusBadge };
