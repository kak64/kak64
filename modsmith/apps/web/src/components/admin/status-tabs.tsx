import Link from "next/link";
import { cn } from "@/lib/utils";

/** searchParams-driven tab strip (server friendly). */
export function StatusTabs({ tabs, current, hrefFor }: { tabs: { value: string; label: string; count?: number }[]; current: string; hrefFor: (value: string) => string }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-border bg-bg-muted p-1" role="tablist">
      {tabs.map((t) => {
        const active = current === t.value;
        return (
          <Link key={t.value} href={hrefFor(t.value)} role="tab" aria-selected={active}
            className={cn("rounded-sm px-3 py-1 text-sm font-medium transition-colors", active ? "bg-bg-elevated text-fg shadow" : "text-fg-muted hover:text-fg")}>
            {t.label}
            {t.count !== undefined ? <span className={cn("ml-1.5 tabular-nums text-xs", active ? "text-accent" : "text-fg-subtle")}>{t.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
