"use client";
/**
 * Standard editor chrome for every browser tool: header with cost + gating, left asset panel,
 * center viewport, right inspector (bottom sheet on small screens), export/estimate flow and
 * the job progress dialog.
 */
import * as React from "react";
import Link from "next/link";
import { Coins, HelpCircle, PanelLeft, PanelRight, Save, Sparkles, Upload } from "lucide-react";
import { getTool } from "@modsmith/core";
import { cn, formatCredits, formatDate } from "@/lib/utils";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, EmptyState, Kbd, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ApiErrorAlert } from "@/components/app/api-error-alert";
import { errorMessage } from "@/components/app/hooks";
import { JobProgress } from "@/components/shared/job-progress";
import { useMe } from "@/hooks/use-me";
import type { CreationDetail } from "./lib";

export interface ToolExportRequest {
  uploadIds: string[];
  config: Record<string, unknown>;
  name?: string;
  externalRef?: { provider: string; id: string; url?: string };
}

export interface EffectiveToolInfo {
  slug: string; name: string; description: string; creditCost: number; status: string; enabled: boolean;
  requiresSubscription: boolean; requiresVerification: boolean; freeDailyExports?: number; accepts: string[]; outputs: string[];
}

export interface JobEstimate {
  toolSlug: string; baseCost: number; discountPct: number; credits: number; freeReexport: boolean;
  reexportUntil: string | null; freeDailyRemaining: number | null; balance: number; canAfford: boolean;
}

/** Tools that must capture an explicit rights confirmation before an export job. */
export const RIGHTS_TOOLS = new Set(["car-importer", "vehicle-editor", "livery-mapper", "retexture", "clothing-textures"]);
export const RIGHTS_STATEMENT = "I own or have permission to use and modify these files.";

export interface ToolFrameProps {
  slug: string;
  /** Left panel (uploads/assets). */
  left?: React.ReactNode;
  leftTitle?: string;
  /** Center content — normally the viewport or canvas editor. */
  children: React.ReactNode;
  /** Right inspector. */
  right?: React.ReactNode;
  rightTitle?: string;
  /** Produce the export payload. Return null to cancel (show your own message first). */
  buildExport?: () => Promise<ToolExportRequest | null> | ToolExportRequest | null;
  exportLabel?: string;
  exportDisabled?: boolean;
  exportDisabledReason?: string;
  /** Hidden entirely for analysis-only screens. */
  hideExport?: boolean;
  /** Editor state persisted to the creation's projectState via "Save project". */
  projectState?: Record<string, unknown>;
  creationId?: string | null;
  /** Called once with a `?creation=<id>` project so the page can restore itself. */
  onLoadCreation?: (creation: CreationDetail) => void;
  shortcuts?: { keys: string; label: string }[];
  /** Fired once the export job reaches a terminal status (used for post-build notices). */
  onJobComplete?: (jobId: string, status: string) => void;
  headerExtra?: React.ReactNode;
  statusSlot?: React.ReactNode;
  /** Extra notice rendered above the workspace (warnings, escrow, replace-detected…). */
  notice?: React.ReactNode;
}

const BASE_SHORTCUTS = [
  { keys: "W / E / R", label: "Move / rotate / scale gizmo" },
  { keys: "Q", label: "Back to select" },
  { keys: "F", label: "Frame the model" },
  { keys: "Drag / right-drag / wheel", label: "Orbit / pan / zoom" },
  { keys: "?", label: "Show this help" },
];

export function ToolFrame(props: ToolFrameProps) {
  const {
    slug, left, leftTitle = "Assets", children, right, rightTitle = "Inspector", buildExport, exportLabel = "Export resource",
    exportDisabled, exportDisabledReason, hideExport, projectState, creationId, onLoadCreation, shortcuts = [], headerExtra, statusSlot, notice, onJobComplete,
  } = props;

  const fallback = getTool(slug);
  const { me } = useMe();
  const { toast } = useToast();
  const [tool, setTool] = React.useState<EffectiveToolInfo | null>(fallback ? { ...fallback, enabled: true } as EffectiveToolInfo : null);
  const [toolError, setToolError] = React.useState<unknown>(null);
  const [loadingTool, setLoadingTool] = React.useState(true);

  const [exportOpen, setExportOpen] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);
  const [request, setRequest] = React.useState<ToolExportRequest | null>(null);
  const [estimate, setEstimate] = React.useState<JobEstimate | null>(null);
  const [estimateError, setEstimateError] = React.useState<unknown>(null);
  const [rights, setRights] = React.useState(false);
  const [jobName, setJobName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [job, setJob] = React.useState<{ id: string; creationId: string | null } | null>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [sheet, setSheet] = React.useState<"none" | "left" | "right">("none");
  const [saving, setSaving] = React.useState(false);
  const loadedCreation = React.useRef(false);

  React.useEffect(() => {
    let alive = true;
    api<EffectiveToolInfo>(`/api/v1/tools/${slug}`)
      .then((t) => { if (alive) setTool(t); })
      .catch((e) => { if (alive) setToolError(e); })
      .finally(() => { if (alive) setLoadingTool(false); });
    return () => { alive = false; };
  }, [slug]);

  // ?creation=<id> → restore a saved project.
  React.useEffect(() => {
    if (loadedCreation.current || !onLoadCreation) return;
    const id = new URLSearchParams(window.location.search).get("creation");
    if (!id) return;
    loadedCreation.current = true;
    api<CreationDetail>(`/api/v1/creations/${id}`)
      .then((c) => onLoadCreation(c))
      .catch((e) => toast({ title: "Could not open that project", description: errorMessage(e), variant: "danger" }));
  }, [onLoadCreation, toast]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) { e.preventDefault(); setHelpOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const emailVerified = me?.user?.emailVerified ?? true;
  const hasSubscription = !!me?.subscription;
  const needsVerification = !!tool?.requiresVerification && !emailVerified;
  const needsSubscription = !!tool?.requiresSubscription && !hasSubscription;
  const unavailable = !!tool && (!tool.enabled || tool.status === "coming_soon" || tool.status === "maintenance");
  const rightsRequired = RIGHTS_TOOLS.has(slug);

  const openExport = async () => {
    if (!buildExport) return;
    setPreparing(true);
    setEstimate(null);
    setEstimateError(null);
    setJob(null);
    try {
      const req = await buildExport();
      if (!req) return;
      setRequest(req);
      setJobName(req.name ?? "");
      setExportOpen(true);
      try {
        const est = await api<JobEstimate>(`/api/v1/tools/${slug}/estimate`, { json: { uploadIds: req.uploadIds, config: req.config, ...(req.externalRef ? { externalRef: { provider: req.externalRef.provider, id: req.externalRef.id } } : {}) } });
        setEstimate(est);
      } catch (err) {
        setEstimateError(err);
      }
    } catch (err) {
      toast({ title: "Could not prepare the export", description: errorMessage(err), variant: "danger" });
    } finally {
      setPreparing(false);
    }
  };

  const submit = async () => {
    if (!request) return;
    setSubmitting(true);
    try {
      const created = await api<{ id: string; creationId: string | null }>("/api/v1/jobs", {
        json: {
          toolSlug: slug,
          uploadIds: request.uploadIds,
          config: request.config,
          name: jobName.trim() || undefined,
          ...(creationId ? { creationId } : {}),
          ...(request.externalRef ? { externalRef: request.externalRef } : {}),
          ...(rightsRequired ? { rightsConfirmed: true } : {}),
          purpose: "export",
        },
      });
      setJob(created);
    } catch (err) {
      setEstimateError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const saveProject = async () => {
    if (!projectState) return;
    if (!creationId) {
      toast({ title: "Saved on this device", description: "Run a preview or export to create a project you can reopen anywhere." });
      return;
    }
    setSaving(true);
    try {
      await api(`/api/v1/creations/${creationId}`, { method: "PATCH", json: { projectState } });
      toast({ title: "Project saved", variant: "success" });
    } catch (err) {
      toast({ title: "Could not save the project", description: errorMessage(err), variant: "danger" });
    } finally {
      setSaving(false);
    }
  };

  if (loadingTool && !tool) {
    return <div className="flex h-64 items-center justify-center"><Spinner className="mr-2" /> Loading tool…</div>;
  }
  if (toolError && !tool) return <ApiErrorAlert error={toolError} />;
  if (unavailable) {
    return (
      <EmptyState
        icon={Sparkles}
        title={tool?.status === "coming_soon" ? `${tool.name} is coming soon` : `${tool?.name ?? "This tool"} is temporarily unavailable`}
        description={tool?.status === "maintenance" ? "We are running maintenance on this tool. Your credits are untouched — try again shortly." : "This tool is not available on your account yet. Browse the other tools in the meantime."}
        action={{ label: "Back to tools", href: "/app/tools" }}
      />
    );
  }

  const cost = tool?.creditCost ?? fallback?.creditCost ?? 0;
  const inspector = right ? <div className="divide-y divide-border">{right}</div> : null;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-bg-elevated px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-base font-semibold tracking-tight">{tool?.name ?? slug}</h1>
          {tool?.status ? <StatusBadge status={tool.status} /> : null}
          {statusSlot}
        </div>
        <Badge variant="outline" className="gap-1"><Coins className="h-3 w-3" aria-hidden /> {cost === 0 ? "Free" : `${formatCredits(cost)} credits / export`}</Badge>
        {me ? <span className="hidden text-xs text-fg-muted sm:inline">Balance: <strong className="tabular-nums text-fg">{formatCredits(me.credits)}</strong></span> : null}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {headerExtra}
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Keyboard shortcuts" onClick={() => setHelpOpen(true)}><HelpCircle /></Button>
          {projectState ? <Button type="button" variant="outline" size="sm" loading={saving} onClick={saveProject}><Save /> Save project</Button> : null}
          {!hideExport && buildExport ? (
            <Button type="button" size="sm" loading={preparing} disabled={exportDisabled || needsVerification || needsSubscription} onClick={openExport} title={exportDisabledReason}>
              <Upload /> {exportLabel}
            </Button>
          ) : null}
        </div>
      </header>

      {exportDisabled && exportDisabledReason ? <Alert variant="info">{exportDisabledReason}</Alert> : null}
      {needsVerification ? <ApiErrorAlert error={new ApiClientError("EMAIL_NOT_VERIFIED", "Verify your email to export with this tool.", 403)} /> : null}
      {needsSubscription ? <ApiErrorAlert error={new ApiClientError("SUBSCRIPTION_REQUIRED", "This tool needs an active subscription.", 403)} /> : null}
      {notice}

      <div className="lg:hidden">
        <Alert variant="info">On a phone this editor works best as a settings panel — use the Assets and Inspector buttons below. A tablet or desktop gives you the full 3D workspace.</Alert>
      </div>

      <div className={cn("grid min-h-0 gap-3", left && inspector ? "lg:grid-cols-[17rem_minmax(0,1fr)_20rem]" : left ? "lg:grid-cols-[17rem_minmax(0,1fr)]" : inspector ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : "")}>
        {left ? (
          <aside className="hidden lg:block">
            <div className="sticky top-4 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border border-border bg-bg-elevated scrollbar-thin">
              <h2 className="border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">{leftTitle}</h2>
              <div className="p-3">{left}</div>
            </div>
          </aside>
        ) : null}

        <div className="min-w-0">{children}</div>

        {inspector ? (
          <aside className="hidden lg:block">
            <div className="sticky top-4 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border border-border bg-bg-elevated scrollbar-thin">
              <h2 className="border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">{rightTitle}</h2>
              {inspector}
            </div>
          </aside>
        ) : null}
      </div>

      {/* Small-screen toolbar → bottom sheets */}
      {(left || inspector) ? (
        <div className="sticky bottom-2 z-30 flex justify-center gap-2 lg:hidden">
          <div className="flex gap-2 rounded-full border border-border bg-bg-elevated/95 p-1.5 shadow-lg backdrop-blur">
            {left ? <Button type="button" size="sm" variant="secondary" onClick={() => setSheet("left")}><PanelLeft /> {leftTitle}</Button> : null}
            {inspector ? <Button type="button" size="sm" variant="secondary" onClick={() => setSheet("right")}><PanelRight /> {rightTitle}</Button> : null}
          </div>
        </div>
      ) : null}

      <Dialog open={sheet !== "none"} onOpenChange={(o) => !o && setSheet("none")}>
        <DialogContent size="lg" className="bottom-0 left-0 top-auto max-h-[80vh] w-full max-w-full translate-x-0 translate-y-0 rounded-b-none p-0">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="text-sm">{sheet === "left" ? leftTitle : rightTitle}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto pb-6">
            {sheet === "left" ? <div className="p-3">{left}</div> : inspector}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>{tool?.name ?? slug}</DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            {[...shortcuts, ...BASE_SHORTCUTS].map((s) => (
              <div key={s.keys + s.label} className="flex items-start justify-between gap-4">
                <dt className="text-fg-muted">{s.label}</dt>
                <dd className="shrink-0"><Kbd>{s.keys}</Kbd></dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={(o) => { setExportOpen(o); if (!o) { setJob(null); setRequest(null); } }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{job ? "Building your resource" : exportLabel}</DialogTitle>
            <DialogDescription>{job ? "You can close this dialog — the build continues on our workers." : `${tool?.name ?? slug} will package your files into a FiveM resource.`}</DialogDescription>
          </DialogHeader>

          {job ? (
            <JobProgress jobId={job.id} creationId={job.creationId ?? creationId ?? null} onDone={(status) => onJobComplete?.(job.id, status)} />
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ms-export-name">Project name</Label>
                <Input id="ms-export-name" value={jobName} maxLength={120} placeholder="My prop" onChange={(e) => setJobName(e.target.value)} />
              </div>

              {estimateError ? <ApiErrorAlert error={estimateError} /> : null}

              {!estimate && !estimateError ? (
                <div className="flex items-center gap-2 text-sm text-fg-muted"><Spinner /> Calculating cost…</div>
              ) : estimate ? (
                <div className="rounded-lg border border-border bg-bg-muted p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-fg-muted">This export</span>
                    <strong className="tabular-nums">{estimate.credits === 0 ? "Free" : `${formatCredits(estimate.credits)} credits`}</strong>
                  </div>
                  {estimate.discountPct > 0 ? (
                    <div className="mt-1 flex items-center justify-between text-xs text-fg-muted">
                      <span>Plan discount</span><span className="tabular-nums text-success">−{estimate.discountPct}% (base {formatCredits(estimate.baseCost)})</span>
                    </div>
                  ) : null}
                  {estimate.freeReexport ? (
                    <p className="mt-1 text-xs text-success">Free re-export — same files and settings{estimate.reexportUntil ? ` until ${formatDate(estimate.reexportUntil)}` : ""}.</p>
                  ) : null}
                  {estimate.freeDailyRemaining !== null ? (
                    <p className="mt-1 text-xs text-fg-muted">Free exports left today: <strong className="tabular-nums text-fg">{estimate.freeDailyRemaining}</strong></p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs">
                    <span className="text-fg-muted">Balance after export</span>
                    <span className="tabular-nums">{formatCredits(Math.max(0, estimate.balance - estimate.credits))} credits</span>
                  </div>
                  {!estimate.canAfford ? (
                    <Alert variant="warning" className="mt-3">
                      Not enough credits — you need {formatCredits(estimate.credits)} and have {formatCredits(estimate.balance)}.{" "}
                      <Link href="/app/credits" className="font-medium underline underline-offset-4">Buy credits</Link>
                    </Alert>
                  ) : null}
                </div>
              ) : null}

              {rightsRequired ? (
                <label className="flex items-start gap-2 rounded-md border border-border bg-bg-muted p-3 text-sm">
                  <Checkbox checked={rights} onCheckedChange={(v) => setRights(v === true)} aria-label={RIGHTS_STATEMENT} className="mt-0.5" />
                  <span>{RIGHTS_STATEMENT} <span className="block text-xs text-fg-subtle">Uploading content you do not have the rights to is against our terms.</span></span>
                </label>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
                <Button loading={submitting} disabled={!estimate?.canAfford || (rightsRequired && !rights)} onClick={submit}>
                  {estimate?.credits === 0 ? "Start export" : `Export for ${formatCredits(estimate?.credits ?? cost)} credits`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ToolFrame;
