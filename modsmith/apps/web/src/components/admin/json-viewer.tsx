import * as React from "react";
import { cn } from "@/lib/utils";

/** Collapsible, pretty-printed JSON block. Server-safe (uses <details>). */
export function JsonViewer({ value, label, open, className, maxHeight = 360 }: { value: unknown; label?: string; open?: boolean; className?: string; maxHeight?: number }) {
  const text = value === undefined || value === null ? "null" : JSON.stringify(value, null, 2);
  const empty = text === "null" || text === "{}" || text === "[]";
  return (
    <details className={cn("group rounded-md border border-border bg-bg-muted", className)} open={open}>
      <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg">
        <span>{label ?? "JSON"}</span>
        <span className="font-mono text-[10px] text-fg-subtle">{empty ? "empty" : `${text.length.toLocaleString("en-US")} chars`}</span>
      </summary>
      <pre className="overflow-auto border-t border-border px-3 py-2 font-mono text-[12px] leading-5 text-fg scrollbar-thin" style={{ maxHeight }}>{text}</pre>
    </details>
  );
}
