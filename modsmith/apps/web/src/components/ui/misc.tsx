import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import Link from "next/link";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin text-fg-muted", className)} aria-label="Loading" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: { label: string; href?: string; onClick?: () => void }; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-bg-elevated/50 px-6 py-14 text-center", className)}>
      {Icon ? <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bg-subtle text-fg-muted"><Icon className="h-6 w-6" /></div> : null}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? (
        <div className="mt-5">
          {action.href ? <Button asChild><Link href={action.href}>{action.label}</Link></Button> : <Button onClick={action.onClick}>{action.label}</Button>}
        </div>
      ) : null}
    </div>
  );
}

export function Alert({ variant = "info", title, children, className }: { variant?: "info" | "warning" | "danger" | "success"; title?: string; children?: React.ReactNode; className?: string }) {
  const styles = {
    info: "border-info/30 bg-info/10 text-info",
    warning: "border-warning/30 bg-warning/10 text-warning",
    danger: "border-danger/30 bg-danger/10 text-danger",
    success: "border-success/30 bg-success/10 text-success",
  }[variant];
  return (
    <div role={variant === "danger" ? "alert" : "status"} className={cn("rounded-md border px-3 py-2.5 text-sm", styles, className)}>
      {title ? <div className="font-medium">{title}</div> : null}
      {children ? <div className={cn(title && "mt-0.5 opacity-90")}>{children}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions, className }: { title: string; description?: string; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-4">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-fg-subtle">
        {label}
        {Icon ? <Icon className="h-4 w-4 text-fg-subtle" /> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-fg-muted">{hint}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border-strong bg-bg-muted px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{children}</kbd>;
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
      <span className="text-fg-muted">Page {page} of {pages}</span>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" disabled={page <= 1}><Link href={hrefFor(Math.max(1, page - 1))} aria-disabled={page <= 1}>Previous</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href={hrefFor(Math.min(pages, page + 1))} aria-disabled={page >= pages}>Next</Link></Button>
      </div>
    </nav>
  );
}
