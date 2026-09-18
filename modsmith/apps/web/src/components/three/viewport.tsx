"use client";
/**
 * Editor viewport: client-only R3F canvas plus the display toolbar, stats readout and
 * WebGL/empty/loading fallbacks. Pages should only ever import this file.
 */
import * as React from "react";
import dynamic from "next/dynamic";
import { Box, Grid3x3, Move, RotateCw, Scaling, MousePointer2, Maximize2, Layers, PersonStanding, Camera, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GizmoMode, ViewportHandle, ViewportProps, ViewportStats } from "./viewport-types";

export type { GizmoMode, ViewportHandle, ViewportProps, ViewportStats, ViewportTransform } from "./viewport-types";

const Scene = dynamic(() => import("./scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-bg-muted text-sm text-fg-muted">
      <Spinner className="mr-2" /> Loading 3D viewport…
    </div>
  ),
});

export function webglAvailable() {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export interface ViewportComponentProps extends Omit<ViewportProps, "wireframe" | "flatShade" | "showBounds" | "showGrid" | "showPed" | "gizmo"> {
  /** Initial toolbar states. */
  defaultWireframe?: boolean;
  defaultFlatShade?: boolean;
  defaultBounds?: boolean;
  defaultGrid?: boolean;
  defaultPed?: boolean;
  /** Show transform gizmo buttons and enable the W/E/R shortcuts. */
  gizmoEnabled?: boolean;
  gizmo?: GizmoMode;
  onGizmoChange?: (mode: GizmoMode) => void;
  toolbar?: boolean;
  extraToolbar?: React.ReactNode;
  /** Shown when there is nothing to render yet. */
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  onScreenshot?: (blob: Blob) => void;
  className?: string;
}

function ToolbarToggle({ active, label, onClick, children, disabled }: { active?: boolean; label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon-sm" variant={active ? "default" : "secondary"} aria-pressed={!!active} aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Viewport({
  object, defaultWireframe = false, defaultFlatShade = false, defaultBounds = false, defaultGrid = true, defaultPed = false,
  gizmoEnabled = false, gizmo: gizmoProp, onGizmoChange, toolbar = true, extraToolbar, emptyMessage = "Upload a model to see it here.",
  loading, loadingMessage = "Preparing preview…", onScreenshot, className, children, apiRef, ...rest
}: ViewportComponentProps) {
  const [wireframe, setWireframe] = React.useState(defaultWireframe);
  const [flatShade, setFlatShade] = React.useState(defaultFlatShade);
  const [bounds, setBounds] = React.useState(defaultBounds);
  const [grid, setGrid] = React.useState(defaultGrid);
  const [ped, setPed] = React.useState(defaultPed);
  const [gizmoState, setGizmoState] = React.useState<GizmoMode>("none");
  const gizmo = gizmoProp ?? gizmoState;
  const setGizmo = React.useCallback((m: GizmoMode) => { setGizmoState(m); onGizmoChange?.(m); }, [onGizmoChange]);
  const [frameTrigger, setFrameTrigger] = React.useState(0);
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const statRef = React.useRef<HTMLSpanElement>(null);
  const localApi = React.useRef<ViewportHandle | null>(null);
  const api = apiRef ?? localApi;

  React.useEffect(() => { setSupported(webglAvailable()); }, []);

  const onStats = React.useCallback((s: ViewportStats) => {
    if (statRef.current) statRef.current.textContent = `${s.fps} fps · ${s.triangles.toLocaleString("en-US")} tris · ${s.calls} draws`;
  }, []);

  const containerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!gizmoEnabled) return;
    const el = containerRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === "w") { e.preventDefault(); setGizmo("translate"); }
      else if (key === "e") { e.preventDefault(); setGizmo("rotate"); }
      else if (key === "r") { e.preventDefault(); setGizmo("scale"); }
      else if (key === "q" || key === "escape") { setGizmo("none"); }
      else if (key === "f") { e.preventDefault(); setFrameTrigger((n) => n + 1); }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [gizmoEnabled, setGizmo]);

  const screenshot = async () => {
    const blob = await api.current?.screenshot();
    if (blob) onScreenshot?.(blob);
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      aria-label="3D viewport"
      className={cn("relative h-full min-h-[320px] w-full overflow-hidden rounded-lg border border-border bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent", className)}
    >
      {supported === false ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center">
          <Info className="h-6 w-6 text-warning" aria-hidden />
          <p className="text-sm font-medium">3D preview is unavailable</p>
          <p className="max-w-sm text-xs text-fg-muted">Your browser or device has WebGL disabled. You can still upload files, change settings and export — the build happens on our servers.</p>
        </div>
      ) : supported === null ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-fg-muted"><Spinner className="mr-2" /> Checking 3D support…</div>
      ) : (
        <>
          <Scene
            {...rest}
            object={object}
            wireframe={wireframe}
            flatShade={flatShade}
            showBounds={bounds}
            showGrid={grid}
            showPed={ped}
            gizmo={gizmo}
            apiRef={api}
            frameTrigger={frameTrigger}
            onStats={onStats}
          >
            {children}
          </Scene>
          {!object && !loading ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="max-w-xs rounded-md bg-bg/70 px-3 py-2 text-sm text-fg-muted backdrop-blur-sm">{emptyMessage}</p>
            </div>
          ) : null}
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/60 backdrop-blur-sm">
              <span className="flex items-center gap-2 text-sm text-fg-muted"><Spinner /> {loadingMessage}</span>
            </div>
          ) : null}
          {toolbar ? (
            <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1 rounded-md border border-border bg-bg/85 p-1 backdrop-blur-sm">
              <ToolbarToggle active={!flatShade} label="Show materials" onClick={() => setFlatShade((v) => !v)}><Layers /></ToolbarToggle>
              <ToolbarToggle active={wireframe} label="Wireframe" onClick={() => setWireframe((v) => !v)}><Grid3x3 /></ToolbarToggle>
              <ToolbarToggle active={bounds} label="Bounding box" onClick={() => setBounds((v) => !v)}><Box /></ToolbarToggle>
              <ToolbarToggle active={grid} label="Ground grid" onClick={() => setGrid((v) => !v)}><Grid3x3 className="rotate-45" /></ToolbarToggle>
              <ToolbarToggle active={ped} label="1.83 m ped reference" onClick={() => setPed((v) => !v)}><PersonStanding /></ToolbarToggle>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              {gizmoEnabled ? (
                <>
                  <ToolbarToggle active={gizmo === "none"} label="Select (Q)" onClick={() => setGizmo("none")}><MousePointer2 /></ToolbarToggle>
                  <ToolbarToggle active={gizmo === "translate"} label="Move (W)" onClick={() => setGizmo("translate")} disabled={!object}><Move /></ToolbarToggle>
                  <ToolbarToggle active={gizmo === "rotate"} label="Rotate (E)" onClick={() => setGizmo("rotate")} disabled={!object}><RotateCw /></ToolbarToggle>
                  <ToolbarToggle active={gizmo === "scale"} label="Scale (R)" onClick={() => setGizmo("scale")} disabled={!object}><Scaling /></ToolbarToggle>
                  <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                </>
              ) : null}
              <ToolbarToggle label="Frame model (F)" onClick={() => setFrameTrigger((n) => n + 1)}><Maximize2 /></ToolbarToggle>
              {onScreenshot ? <ToolbarToggle label="Capture thumbnail" onClick={screenshot} disabled={!object}><Camera /></ToolbarToggle> : null}
              {extraToolbar}
            </div>
          ) : null}
          <span ref={statRef} className="pointer-events-none absolute bottom-2 right-2 rounded bg-bg/80 px-2 py-1 font-mono text-[10px] text-fg-subtle tabular-nums" aria-live="off">
            — fps
          </span>
        </>
      )}
    </div>
  );
}

export default Viewport;
