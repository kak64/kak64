import * as React from "react";
import { cn } from "@/lib/utils";

export function CodeBlock({ code, lang, title, className }: { code: string; lang?: "lua" | "json" | "bash" | "cfg" | "http" | "text"; title?: string; className?: string }) {
  return (
    <figure className={cn("my-4 overflow-hidden rounded-lg border border-border bg-bg-elevated", className)}>
      {(title || lang) ? (
        <figcaption className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono text-[11px] text-fg-subtle">
          <span>{title ?? ""}</span>
          {lang ? <span className="uppercase">{lang}</span> : null}
        </figcaption>
      ) : null}
      <pre className="overflow-x-auto p-4 text-[13px] leading-6 text-fg"><code className={lang ? `language-${lang}` : undefined}>{code.trim()}</code></pre>
    </figure>
  );
}

export function DocSection({ id, title, children, level = 2 }: { id: string; title: string; children: React.ReactNode; level?: 2 | 3 }) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24", level === 2 ? "mt-12 first:mt-0" : "mt-8")}>
      <H id={`${id}-title`} className={cn("font-semibold tracking-tight text-fg", level === 2 ? "text-2xl" : "text-lg")}>
        <a href={`#${id}`} className="hover:text-accent">{title}</a>
      </H>
      <div className="mt-3 space-y-4 text-sm leading-7 text-fg-muted [&_strong]:font-semibold [&_strong]:text-fg [&_code]:rounded [&_code]:border [&_code]:border-border [&_code]:bg-bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-fg [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6">
        {children}
      </div>
    </section>
  );
}

export function DocTable({ head, rows, caption }: { head: string[]; rows: React.ReactNode[][]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[28rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead><tr className="border-b border-border bg-bg-elevated text-left text-xs uppercase tracking-wide text-fg-subtle">{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-border last:border-0">{r.map((c, j) => <td key={j} className="px-3 py-2 align-top text-fg-muted first:font-mono first:text-[13px] first:text-fg">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warning" | "success"; title?: string; children: React.ReactNode }) {
  const styles = { info: "border-info/30 bg-info/10", warning: "border-warning/30 bg-warning/10", success: "border-success/30 bg-success/10" }[tone];
  return (
    <div className={cn("rounded-md border px-4 py-3 text-sm leading-6 text-fg", styles)} role="note">
      {title ? <div className="font-semibold">{title}</div> : null}
      <div className={cn(title && "mt-1 text-fg-muted")}>{children}</div>
    </div>
  );
}

export function DocsSidebar({ items, title = "On this page" }: { items: { id: string; label: string; children?: { id: string; label: string }[] }[]; title?: string }) {
  return (
    <nav aria-label={title} className="rounded-lg border border-border bg-bg-elevated p-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{title}</h2>
      <ol className="mt-3 space-y-1 text-sm">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} className="block rounded px-2 py-1 text-fg-muted hover:bg-bg-subtle hover:text-fg">{i.label}</a>
            {i.children?.length ? (
              <ol className="ml-2 border-l border-border pl-2">
                {i.children.map((c) => <li key={c.id}><a href={`#${c.id}`} className="block rounded px-2 py-0.5 text-xs text-fg-subtle hover:bg-bg-subtle hover:text-fg">{c.label}</a></li>)}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
