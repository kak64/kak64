"use client";
/** Small inspector building blocks shared by every editor's right-hand panel. */
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

export function Panel({ title, children, defaultOpen = true, actions, className }: { title: string; children: React.ReactNode; defaultOpen?: boolean; actions?: React.ReactNode; className?: string }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const id = React.useId();
  return (
    <section className={cn("border-b border-border last:border-b-0", className)}>
      <div className="flex items-center justify-between gap-2 px-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-1.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-fg-muted hover:text-fg"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} aria-hidden />
          {title}
        </button>
        {actions}
      </div>
      <div id={id} hidden={!open} className="space-y-3 px-3 pb-3.5">{children}</div>
    </section>
  );
}

export function Row({ label, hint, htmlFor, children, className }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs text-fg-muted">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] leading-4 text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export function ToggleRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-xs">{label}</Label>
        {hint ? <p className="mt-0.5 text-[11px] leading-4 text-fg-subtle">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

export function SliderField({ label, value, min, max, step = 0.01, onChange, format, disabled }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; disabled?: boolean }) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs text-fg-muted">{label}</Label>
        <span className="font-mono text-[11px] tabular-nums text-fg-subtle">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <Slider id={id} value={[value]} min={min} max={max} step={step} disabled={disabled} onValueChange={(v) => onChange(v[0] ?? value)} aria-label={label} />
    </div>
  );
}

export function NumberField({ label, value, onChange, step = 0.01, min, max, disabled, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; disabled?: boolean; suffix?: string }) {
  const id = React.useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px] text-fg-subtle">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          className="h-8 text-xs tabular-nums"
          value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) onChange(n); }}
        />
        {suffix ? <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-fg-subtle">{suffix}</span> : null}
      </div>
    </div>
  );
}

export function Vec3Field({ label, value, onChange, step = 0.01, suffix, disabled }: { label: string; value: [number, number, number]; onChange: (v: [number, number, number]) => void; step?: number; suffix?: string; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-fg-muted">{label}</Label>
      <div className="grid grid-cols-3 gap-2">
        {(["X", "Y", "Z"] as const).map((axis, i) => (
          <NumberField
            key={axis}
            label={axis}
            suffix={suffix}
            step={step}
            disabled={disabled}
            value={value[i] ?? 0}
            onChange={(n) => { const next: [number, number, number] = [...value]; next[i] = n; onChange(next); }}
          />
        ))}
      </div>
    </div>
  );
}

export function SelectField({ label, value, onChange, options, hint, disabled }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; hint?: string; disabled?: boolean }) {
  const id = React.useId();
  return (
    <Row label={label} hint={hint} htmlFor={id}>
      <NativeSelect id={id} className="h-8 text-xs" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </NativeSelect>
    </Row>
  );
}

export function TextField({ label, value, onChange, placeholder, hint, error, maxLength, disabled, mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; error?: string; maxLength?: number; disabled?: boolean; mono?: boolean }) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-fg-muted">{label}</Label>
      <Input id={id} className={cn("h-8 text-xs", mono && "font-mono")} value={value} placeholder={placeholder} maxLength={maxLength} disabled={disabled} invalid={!!error} onChange={(e) => onChange(e.target.value)} />
      {error ? <p className="text-[11px] text-danger" role="alert">{error}</p> : hint ? <p className="text-[11px] leading-4 text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export function TextAreaField({ label, value, onChange, placeholder, hint, maxLength, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; maxLength?: number; rows?: number }) {
  const id = React.useId();
  return (
    <Row label={label} hint={hint} htmlFor={id}>
      <Textarea id={id} rows={rows} className="text-xs" value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
    </Row>
  );
}

export function ColorField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const id = React.useId();
  return (
    <Row label={label} hint={hint} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-border bg-bg-elevated p-0.5" aria-label={label} />
        <Input className="h-8 flex-1 font-mono text-xs uppercase" value={value} maxLength={7} onChange={(e) => { const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`; onChange(v.slice(0, 7)); }} />
      </div>
    </Row>
  );
}
