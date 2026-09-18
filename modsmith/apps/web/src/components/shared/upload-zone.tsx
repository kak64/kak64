"use client";
import * as React from "react";
import { UploadCloud, X, RotateCcw, FileBox, CheckCircle2, AlertCircle } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UploadItem } from "@/hooks/use-upload";

export function UploadZone({ accept, multiple = true, onFiles, items, onCancel, onRetry, onRemove, hint, className, disabled }: {
  accept: string[];
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  items: UploadItem[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  hint?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const acceptExt = accept.filter((a) => a.startsWith("."));

  const handleFiles = (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => !acceptExt.length || acceptExt.some((e) => f.name.toLowerCase().endsWith(e)));
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        aria-label="Upload files"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled) { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) handleFiles(e.dataTransfer.files); }}
        className={cn("flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors", drag ? "border-accent bg-accent-soft" : "border-border-strong bg-bg-elevated hover:border-accent/60", disabled && "cursor-not-allowed opacity-60")}
      >
        <UploadCloud className="mb-3 h-8 w-8 text-accent" aria-hidden />
        <p className="text-sm font-medium">Drop files here or <span className="text-accent underline underline-offset-4">browse</span></p>
        <p className="mt-1 text-xs text-fg-muted">{hint ?? `Accepted: ${acceptExt.join(", ")}`}</p>
        <input ref={inputRef} type="file" className="sr-only" multiple={multiple} accept={acceptExt.join(",")} onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} disabled={disabled} />
      </div>
      {items.length ? (
        <ul className="space-y-2" aria-live="polite">
          {items.map((i) => (
            <li key={i.localId} className="rounded-md border border-border bg-bg-elevated p-3">
              <div className="flex items-center gap-3">
                <FileBox className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{i.file.name}</span>
                    <span className="shrink-0 text-xs text-fg-muted tabular-nums">{formatBytes(i.file.size)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
                    {i.status === "done" ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Uploaded &amp; verified</span>
                      : i.status === "error" ? <span className="inline-flex items-center gap-1 text-danger"><AlertCircle className="h-3.5 w-3.5" /> {i.error}</span>
                      : i.status === "cancelled" ? <span>Cancelled</span>
                      : i.status === "hashing" ? <span>Computing checksum…</span>
                      : i.status === "verifying" ? <span>Verifying on server…</span>
                      : <span className="tabular-nums">{i.progress}% · {formatBytes(i.speedBps)}/s{i.etaSeconds != null ? ` · ${i.etaSeconds}s left` : ""}</span>}
                  </div>
                  {["uploading", "hashing", "verifying"].includes(i.status) ? <Progress value={i.progress} className="mt-2 h-1.5" aria-label={`Uploading ${i.file.name}`} /> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {["uploading", "hashing", "verifying"].includes(i.status) ? <Button variant="ghost" size="icon-sm" onClick={() => onCancel(i.localId)} aria-label="Cancel upload"><X /></Button> : null}
                  {(i.status === "error" || i.status === "cancelled") ? <Button variant="ghost" size="icon-sm" onClick={() => onRetry(i.localId)} aria-label="Retry upload"><RotateCcw /></Button> : null}
                  {i.status !== "uploading" ? <Button variant="ghost" size="icon-sm" onClick={() => onRemove(i.localId)} aria-label="Remove file"><X /></Button> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
