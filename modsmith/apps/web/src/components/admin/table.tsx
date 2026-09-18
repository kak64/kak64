import * as React from "react";
import { cn } from "@/lib/utils";

/** Responsive table primitives: the wrapper scrolls horizontally on small screens. */
export function TableWrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border bg-bg-elevated scrollbar-thin", className)}>
      {children}
    </div>
  );
}

export function Table({ className, minWidth = 720, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { minWidth?: number }) {
  return <table className={cn("w-full border-collapse text-left text-[13px]", className)} style={{ minWidth }} {...props} />;
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-bg-muted text-[11px] uppercase tracking-wide text-fg-subtle", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-bg-muted/60", className)} {...props} />;
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("whitespace-nowrap px-3 py-2 font-medium", className)} {...props} />;
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2 align-middle", className)} {...props} />;
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs text-fg-muted", className)}>{children}</span>;
}

export function ShortId({ id }: { id: string }) {
  return <span className="font-mono text-xs text-fg-muted" title={id}>{id.slice(0, 8)}…</span>;
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-fg-muted">{children}</td>
    </tr>
  );
}

export function ResultCount({ total, page, pageSize }: { total: number; page: number; pageSize: number }) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return <p className="text-xs text-fg-subtle">Showing {from}–{to} of {total.toLocaleString("en-US")}</p>;
}

export function Bool({ value }: { value: boolean }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", value ? "bg-success" : "bg-border-strong")} aria-label={value ? "yes" : "no"} />;
}

export function KeyValue({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="flex min-w-0 flex-col gap-0.5 border-b border-border/60 py-1.5 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-fg-subtle">{it.label}</dt>
          <dd className="min-w-0 truncate text-right text-fg">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
