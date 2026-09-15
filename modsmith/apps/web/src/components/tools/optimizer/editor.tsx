"use client";
/** Resource / Vehicle / Map optimizer: free analysis via an inspect job, then a paid optimize export. */
import * as React from "react";
import { AlertTriangle, BarChart3, FileArchive, Gauge, HardDrive } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, Spinner, Stat } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadZone } from "@/components/shared/upload-zone";
import { useUpload } from "@/hooks/use-upload";
import { ToolFrame, type ToolExportRequest } from "../tool-frame";
import { Panel, SelectField, ToggleRow } from "../panels";
import { artifactJson, formatVram, hasArtifact, useDraftState, useInspect, type CreationDetail, type OptimizerReport } from "../lib";

export type OptimizerKind = "general" | "vehicle" | "map";

interface OptimizerDraft extends Record<string, unknown> {
  maxTextureSize: number;
  generateMipmaps: boolean;
  compressTextures: boolean;
}

const INITIAL: OptimizerDraft = { maxTextureSize: 2048, generateMipmaps: true, compressTextures: true };

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const SEVERITY_VARIANT = { critical: "danger", high: "danger", medium: "warning", low: "default" } as const;

export function OptimizerEditor({ slug, kind, title }: { slug: string; kind: OptimizerKind; title: string }) {
  const upload = useUpload(slug);
  const inspect = useInspect(slug);
  const [draft, setDraft] = useDraftState<OptimizerDraft>(slug, INITIAL);
  const [report, setReport] = React.useState<OptimizerReport | null>(null);
  const [reportError, setReportError] = React.useState<string | null>(null);
  const [creationId, setCreationId] = React.useState<string | null>(null);

  const zip = upload.completed[0];

  React.useEffect(() => { if (inspect.creationId) setCreationId(inspect.creationId); }, [inspect.creationId]);

  const loadReport = React.useCallback(async (jobId: string) => {
    try {
      setReport(await artifactJson<OptimizerReport>(jobId, "report.json"));
      setReportError(null);
    } catch (err) {
      setReportError((err as Error).message);
    }
  }, []);

  const analyze = async () => {
    if (!zip?.uploadId) return;
    setReport(null);
    setReportError(null);
    const result = await inspect.start([zip.uploadId], { kind }, creationId);
    if (result?.status === "done" && result.jobId) {
      if (hasArtifact(result.manifest, "report.json")) await loadReport(result.jobId);
      else setReportError("The analysis finished but produced no report.");
    }
  };

  const onLoadCreation = React.useCallback((c: CreationDetail) => {
    setCreationId(c.id);
    const preview = c.projectState?.preview;
    const saved = (c.projectState ?? {}) as Partial<OptimizerDraft>;
    setDraft((prev) => ({ ...prev, ...saved }));
    if (preview?.jobId) {
      inspect.adopt(preview.jobId, preview.manifest, preview.facts, c.id);
      void loadReport(preview.jobId);
    }
  }, [inspect, loadReport, setDraft]);

  const buildExport = async (): Promise<ToolExportRequest | null> => {
    if (!zip?.uploadId) return null;
    return {
      uploadIds: [zip.uploadId],
      config: {
        mode: "optimize",
        maxTextureSize: draft.maxTextureSize,
        generateMipmaps: draft.generateMipmaps,
        compressTextures: draft.compressTextures,
        kind,
      },
      name: zip.file.name.replace(/\.zip$/i, ""),
    };
  };

  const issues = React.useMemo(
    () => (report?.issues ?? []).slice().sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.savingsBytes - a.savingsBytes),
    [report],
  );
  const potentialSavings = issues.reduce((sum, i) => sum + (i.savingsBytes || 0), 0);

  const left = (
    <div className="space-y-4">
      <UploadZone
        accept={[".zip"]}
        multiple={false}
        onFiles={(files) => { upload.reset(); setReport(null); inspect.reset(); upload.add(files); }}
        items={upload.items}
        onCancel={upload.cancel}
        onRetry={upload.retry}
        onRemove={(id) => void upload.remove(id)}
        hint="A resource ZIP — stream folder, meta files and all"
      />
      <Button className="w-full" disabled={!zip?.uploadId} loading={inspect.status === "running"} onClick={analyze}>
        <Gauge /> {report ? "Re-run analysis" : "Analyze (free)"}
      </Button>
      <p className="text-[11px] text-fg-subtle">Analysis is always free. Building the optimized resource costs credits.</p>
      {inspect.status === "error" ? <Alert variant="danger" title="Analysis failed">{inspect.error}</Alert> : null}
      {reportError ? <Alert variant="warning">{reportError}</Alert> : null}
    </div>
  );

  const right = (
    <Panel title="Optimization options">
      <SelectField
        label="Maximum texture size"
        value={String(draft.maxTextureSize)}
        onChange={(v) => setDraft({ maxTextureSize: Number(v) })}
        options={[256, 512, 1024, 2048, 4096].map((n) => ({ value: String(n), label: `${n} × ${n}` }))}
        hint="Anything larger is downscaled. 2048 is a safe default for most servers."
      />
      <ToggleRow label="Generate mipmaps" hint="Missing mipmaps cost VRAM and cause shimmering at distance." checked={draft.generateMipmaps} onChange={(v) => setDraft({ generateMipmaps: v })} />
      <ToggleRow label="Compress textures" hint="Re-encode to DXT/BC. Large saving, small quality cost." checked={draft.compressTextures} onChange={(v) => setDraft({ compressTextures: v })} />
      {kind === "vehicle" ? <Alert variant="info">Vehicle mode only touches textures — geometry, handling and metadata are untouched.</Alert> : null}
      {kind === "map" ? <Alert variant="info">Map mode also flags unused assets and missing LODs across the interior.</Alert> : null}
    </Panel>
  );

  return (
    <ToolFrame
      slug={slug}
      left={left}
      leftTitle="Resource"
      right={right}
      rightTitle="Options"
      buildExport={buildExport}
      exportLabel="Optimize resource"
      exportDisabled={!zip?.uploadId}
      exportDisabledReason={!zip?.uploadId ? "Upload a resource ZIP first." : undefined}
      projectState={draft}
      creationId={creationId}
      onLoadCreation={onLoadCreation}
    >
      {inspect.status === "running" ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-bg-elevated text-sm text-fg-muted">
          <Spinner /> Measuring textures, VRAM and LODs…
        </div>
      ) : !report ? (
        <EmptyState
          icon={BarChart3}
          title={`${title} report`}
          description="Upload a resource ZIP and run the free analysis to see real graphics memory usage, oversized textures and missing LODs."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Disk size" value={formatBytes(report.totalBytes)} icon={FileArchive} />
            <Stat label="Estimated VRAM" value={formatVram(report.estimatedVramBytes)} hint="Expanded in graphics memory — not the ZIP size" icon={HardDrive} />
            <Stat label="Potential saving" value={formatVram(potentialSavings)} hint={`${issues.length} issue${issues.length === 1 ? "" : "s"} found`} icon={AlertTriangle} />
          </div>

          <div className="rounded-lg border border-border bg-bg-elevated p-4">
            <h3 className="text-sm font-semibold">Memory profile</h3>
            <Bar label="Disk" value={report.totalBytes} max={Math.max(report.totalBytes, report.estimatedVramBytes)} format={formatBytes} className="bg-info" />
            <Bar label="VRAM" value={report.estimatedVramBytes} max={Math.max(report.totalBytes, report.estimatedVramBytes)} format={formatVram} className="bg-warning" />
            {report.beforeAfter ? (
              <>
                <div className="mt-4 border-t border-border pt-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">After optimization (estimate)</div>
                <Bar label="Disk" value={report.beforeAfter.diskBytes[1]} max={Math.max(report.beforeAfter.diskBytes[0], report.beforeAfter.vramBytes[0])} format={formatBytes} className="bg-success" />
                <Bar label="VRAM" value={report.beforeAfter.vramBytes[1]} max={Math.max(report.beforeAfter.diskBytes[0], report.beforeAfter.vramBytes[0])} format={formatVram} className="bg-success" />
              </>
            ) : null}
          </div>

          <Tabs defaultValue="issues">
            <TabsList>
              <TabsTrigger value="issues">Issues ({issues.length})</TabsTrigger>
              <TabsTrigger value="files">Files ({report.files.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="issues">
              {!issues.length ? (
                <Alert variant="success" title="No issues found">This resource is already within sensible limits.</Alert>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead className="bg-bg-muted text-left text-xs uppercase tracking-wide text-fg-subtle">
                      <tr><th className="p-2">Severity</th><th className="p-2">File</th><th className="p-2">Problem</th><th className="p-2">Recommendation</th><th className="p-2 text-right">Saving</th></tr>
                    </thead>
                    <tbody>
                      {issues.map((i, idx) => (
                        <tr key={`${i.code}-${i.path}-${idx}`} className="border-t border-border align-top">
                          <td className="p-2"><Badge variant={SEVERITY_VARIANT[i.severity]}>{i.severity}</Badge></td>
                          <td className="p-2"><span className="block max-w-56 truncate font-mono text-xs" title={i.path}>{i.path}</span>{i.texture ? <span className="text-[11px] text-fg-subtle">{i.texture}</span> : null}</td>
                          <td className="p-2">{i.message}</td>
                          <td className="p-2 text-fg-muted">{i.recommendation}</td>
                          <td className="p-2 text-right tabular-nums">{i.savingsBytes ? formatVram(i.savingsBytes) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
            <TabsContent value="files">
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[42rem] text-sm">
                  <thead className="bg-bg-muted text-left text-xs uppercase tracking-wide text-fg-subtle">
                    <tr><th className="p-2">Path</th><th className="p-2">Type</th><th className="p-2 text-right">Disk</th><th className="p-2 text-right">VRAM</th><th className="p-2">LODs</th></tr>
                  </thead>
                  <tbody>
                    {report.files.map((f) => (
                      <tr key={f.path} className="border-t border-border">
                        <td className="p-2"><span className="block max-w-72 truncate font-mono text-xs" title={f.path}>{f.path}</span>
                          {f.textures?.length ? <span className="text-[11px] text-fg-subtle">{f.textures.length} texture{f.textures.length === 1 ? "" : "s"} · largest {Math.max(...f.textures.map((t) => t.width))}px</span> : null}
                        </td>
                        <td className="p-2"><Badge variant="outline">{f.type}</Badge></td>
                        <td className="p-2 text-right tabular-nums">{formatBytes(f.bytes)}</td>
                        <td className="p-2 text-right tabular-nums">{formatVram(f.vramBytes)}</td>
                        <td className="p-2 text-xs text-fg-muted">
                          {f.lods ? (["high", "med", "low", "vlow"] as const).filter((k) => f.lods?.[k]).join(" · ") || "none" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </ToolFrame>
  );
}

function Bar({ label, value, max, format, className }: { label: string; value: number; max: number; format: (n: number) => string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="tabular-nums">{format(value)}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
        <div className={cn("h-full rounded-full", className)} style={{ width: `${pct}%` }} role="presentation" />
      </div>
    </div>
  );
}

export default OptimizerEditor;
