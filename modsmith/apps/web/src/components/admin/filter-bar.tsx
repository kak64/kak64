"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export type FilterField =
  | { type: "search"; name: string; placeholder?: string; label?: string }
  | { type: "select"; name: string; label?: string; options: { value: string; label: string }[]; allLabel?: string };

/** URL-driven filters: writes to searchParams and resets the page. */
export function FilterBar({ fields, children }: { fields: FilterField[]; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [search, setSearch] = React.useState<Record<string, string>>(() => Object.fromEntries(fields.filter((f) => f.type === "search").map((f) => [f.name, sp.get(f.name) ?? ""])));

  const apply = (patch: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) q.set(k, v); else q.delete(k); }
    q.delete("page");
    const qs = q.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
  const hasAny = fields.some((f) => sp.get(f.name));

  return (
    <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); apply(search); }} role="search">
      {fields.map((f) =>
        f.type === "search" ? (
          <label key={f.name} className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <span className="sr-only">{f.label ?? "Search"}</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <Input name={f.name} value={search[f.name] ?? ""} onChange={(e) => setSearch((s) => ({ ...s, [f.name]: e.target.value }))} placeholder={f.placeholder ?? "Search…"} className="pl-8" />
          </label>
        ) : (
          <label key={f.name} className="flex flex-col gap-1 text-xs text-fg-subtle">
            {f.label ? <span>{f.label}</span> : null}
            <NativeSelect name={f.name} value={sp.get(f.name) ?? ""} onChange={(e) => apply({ ...search, [f.name]: e.target.value })} className="h-9 w-auto min-w-[140px]" aria-label={f.label ?? f.name}>
              <option value="">{f.allLabel ?? "All"}</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </NativeSelect>
          </label>
        ),
      )}
      {fields.some((f) => f.type === "search") ? <Button type="submit" variant="secondary" size="default">Apply</Button> : null}
      {hasAny ? <Button type="button" variant="ghost" size="default" onClick={() => { setSearch({}); router.push(pathname); }}><X />Clear</Button> : null}
      {children ? <div className="ml-auto flex items-center gap-2">{children}</div> : null}
    </form>
  );
}
