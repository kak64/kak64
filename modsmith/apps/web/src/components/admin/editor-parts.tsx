"use client";
import * as React from "react";
import { Eye, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/form";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "./markdown-preview";

/** Text input with a live character counter against a hard limit. */
export function CountedField({ label, id, value, onChange, max, hint, textarea, rows }: {
  label: string; id: string; value: string; onChange: (v: string) => void; max: number; hint?: string; textarea?: boolean; rows?: number;
}) {
  const over = value.length > max;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium leading-none text-fg">{label}</label>
        <span className={cn("text-[11px] tabular-nums", over ? "text-danger" : value.length > max * 0.9 ? "text-warning" : "text-fg-subtle")}>{value.length}/{max}</span>
      </div>
      {textarea
        ? <Textarea id={id} rows={rows ?? 3} value={value} onChange={(e) => onChange(e.target.value)} invalid={over} />
        : <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} invalid={over} />}
      {hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

/** Markdown editor with a side-by-side (or toggled, on small screens) live preview. */
export function MarkdownField({ label, id, value, onChange, rows = 22, hint }: { label: string; id: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string }) {
  const [mobileView, setMobileView] = React.useState<"write" | "preview">("write");
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium leading-none text-fg">{label}</label>
        <div className="flex items-center gap-1 lg:hidden">
          <Button type="button" size="sm" variant={mobileView === "write" ? "secondary" : "ghost"} onClick={() => setMobileView("write")}><Pencil />Write</Button>
          <Button type="button" size="sm" variant={mobileView === "preview" ? "secondary" : "ghost"} onClick={() => setMobileView("preview")}><Eye />Preview</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} spellCheck
          className={cn("font-mono text-[13px] leading-6", mobileView === "preview" && "hidden lg:block")} />
        <div className={cn("max-h-[560px] overflow-y-auto rounded-md border border-border bg-bg-muted/40 p-4 scrollbar-thin", mobileView === "write" && "hidden lg:block")}>
          <MarkdownPreview markdown={value} />
        </div>
      </div>
      {hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export type Faq = { question: string; answer: string };

/** Add / edit / remove FAQ entries. */
export function FaqRepeater({ faqs, onChange }: { faqs: Faq[]; onChange: (f: Faq[]) => void }) {
  const set = (i: number, patch: Partial<Faq>) => onChange(faqs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  return (
    <div className="space-y-3">
      {faqs.length === 0 ? <p className="text-xs text-fg-subtle">No FAQs yet. They render as structured data on the public guide.</p> : null}
      {faqs.map((f, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border bg-bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">FAQ {i + 1}</span>
            <div className="flex items-center gap-1">
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0}
                onClick={() => { const next = [...faqs]; [next[i - 1], next[i]] = [next[i]!, next[i - 1]!]; onChange(next); }}>↑</Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === faqs.length - 1}
                onClick={() => { const next = [...faqs]; [next[i + 1], next[i]] = [next[i]!, next[i + 1]!]; onChange(next); }}>↓</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(faqs.filter((_, idx) => idx !== i))}>Remove</Button>
            </div>
          </div>
          <Field label="Question" htmlFor={`faq-q-${i}`}><Input id={`faq-q-${i}`} value={f.question} onChange={(e) => set(i, { question: e.target.value })} /></Field>
          <Field label="Answer" htmlFor={`faq-a-${i}`}><Textarea id={`faq-a-${i}`} rows={3} value={f.answer} onChange={(e) => set(i, { answer: e.target.value })} /></Field>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...faqs, { question: "", answer: "" }])}>Add FAQ</Button>
    </div>
  );
}

/** Sticky save bar for editor pages. */
export function EditorBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      {children}
    </div>
  );
}
