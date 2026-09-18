import { Check, X } from "lucide-react";

const TRADITIONAL = ["Install Blender", "Install plugins", "Configure model", "Build collision", "Export", "Use CodeWalker", "Create metadata", "Create manifest", "Test in FiveM"];
const MODSMITH = ["Upload", "Configure", "Preview", "Export", "Download", "Add to server"];

export function WorkflowCompare() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-bg-elevated p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-fg">The traditional way</h3>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-fg-muted">{TRADITIONAL.length} steps · 4+ tools · Windows</span>
        </div>
        <ol className="mt-5 space-y-2.5">
          {TRADITIONAL.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-sm text-fg-muted">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-bg-muted font-mono text-[11px] text-fg-subtle">{i + 1}</span>
              <span className="flex-1">{s}</span>
              <X className="h-4 w-4 text-fg-subtle" aria-hidden />
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs leading-5 text-fg-subtle">Every step has its own installer, version quirks and a forum thread explaining why it broke.</p>
      </div>
      <div className="glow-ring rounded-lg border border-accent/40 bg-bg-elevated p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-fg">With Modsmith</h3>
          <span className="rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 text-xs text-accent">{MODSMITH.length} steps · 1 browser tab · any OS</span>
        </div>
        <ol className="mt-5 space-y-2.5">
          {MODSMITH.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-sm text-fg">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-accent/40 bg-accent-soft font-mono text-[11px] text-accent">{i + 1}</span>
              <span className="flex-1">{s}</span>
              <Check className="h-4 w-4 text-success" aria-hidden />
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs leading-5 text-fg-muted">Nothing to install. Validation, conversion and packaging happen on our workers; you get a resource folder that streams.</p>
      </div>
    </div>
  );
}
