"use client";
/** Vehicle Editor: debadge, detrim, swap wheels, tune stance and re-export unlocked add-on vehicles. */
import * as React from "react";
import * as THREE from "three";
import { Car, Eye, EyeOff, ScanSearch, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { UploadZone } from "@/components/shared/upload-zone";
import { useUpload } from "@/hooks/use-upload";
import { errorMessage } from "@/components/app/hooks";
import { Viewport } from "@/components/three/viewport";
import { loadGlbFromUrl, type LoadedModel } from "@/lib/three/loaders";
import { ToolFrame, type ToolExportRequest } from "../tool-frame";
import { ColorField, Panel, Row, SelectField, SliderField, TextField, ToggleRow } from "../panels";
import { artifactJson, artifactUrl, hasArtifact, snakeCase, useDraftState, useInspect, type ComponentInfo, type CreationDetail, type TextureInfo } from "../lib";

const SLUG = "vehicle-editor";

/** Common vanilla wheel sets; `config.wheels.model` is a free-form name the worker resolves. */
const WHEEL_MODELS = [
  { value: "", label: "Keep original wheels" },
  { value: "sport_01", label: "Sport — Fifteen" }, { value: "sport_05", label: "Sport — Alloy" },
  { value: "muscle_02", label: "Muscle — Dukes" }, { value: "muscle_07", label: "Muscle — Classic five" },
  { value: "lowrider_03", label: "Lowrider — Wired" }, { value: "suv_04", label: "SUV — Dash" },
  { value: "offroad_02", label: "Off-road — Raider" }, { value: "tuner_06", label: "Tuner — Fujiwara" },
  { value: "highend_03", label: "High-end — Cosmo" }, { value: "bennys_01", label: "Benny's — Wire" },
];

const QUICK_FILTERS: { key: string; label: string; pattern: RegExp }[] = [
  { key: "badge", label: "Badges", pattern: /badge|emblem|logo|lettering|script/i },
  { key: "trim", label: "Trim", pattern: /trim|molding|moulding|strip/i },
  { key: "chrome", label: "Chrome", pattern: /chrome|shiny|polish/i },
  { key: "spoiler", label: "Spoilers", pattern: /spoiler|wing/i },
];

interface VehicleDraft extends Record<string, unknown> {
  spawnName: string;
  hiddenParts: string[];
  removedParts: string[];
  wheelModel: string;
  wheelWidth: number;
  wheelOffset: number;
  frontHeight: number;
  rearHeight: number;
  camber: number;
  glowEnabled: boolean;
  glowColor: string;
  maxTextureSize: number;
  lodBias: number;
}

const INITIAL: VehicleDraft = {
  spawnName: "", hiddenParts: [], removedParts: [], wheelModel: "", wheelWidth: 1, wheelOffset: 0,
  frontHeight: 0, rearHeight: 0, camber: 0, glowEnabled: false, glowColor: "#00ffff", maxTextureSize: 2048, lodBias: 1,
};

function flatten(components: ComponentInfo[], depth = 0): { info: ComponentInfo; depth: number }[] {
  return components.flatMap((c) => [{ info: c, depth }, ...(c.children ? flatten(c.children, depth + 1) : [])]);
}

export function VehicleEditorEditor() {
  const { toast } = useToast();
  const upload = useUpload(SLUG);
  const inspect = useInspect(SLUG);
  const [draft, setDraft] = useDraftState<VehicleDraft>(SLUG, INITIAL);
  const [model, setModel] = React.useState<LoadedModel | null>(null);
  const [components, setComponents] = React.useState<ComponentInfo[]>([]);
  const [textures, setTextures] = React.useState<TextureInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creationId, setCreationId] = React.useState<string | null>(null);
  const [selectedMesh, setSelectedMesh] = React.useState<string | null>(null);

  React.useEffect(() => { if (inspect.creationId) setCreationId(inspect.creationId); }, [inspect.creationId]);

  const loadPreview = React.useCallback(async (jobId: string) => {
    setLoading(true);
    try {
      const [glbUrl, comps, texs] = await Promise.all([
        artifactUrl(jobId, "preview.glb"),
        artifactJson<ComponentInfo[]>(jobId, "components.json").catch(() => [] as ComponentInfo[]),
        artifactJson<TextureInfo[]>(jobId, "textures.json").catch(() => [] as TextureInfo[]),
      ]);
      const loaded = await loadGlbFromUrl(glbUrl);
      setModel(loaded);
      setComponents(comps.length ? comps : loaded.meshes.map((m) => ({ name: m.name })));
      setTextures(texs);
    } catch (err) {
      toast({ title: "Could not load the vehicle", description: errorMessage(err), variant: "danger" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const analyze = async () => {
    if (!upload.uploadIds.length) return;
    setModel(null);
    const result = await inspect.start(upload.uploadIds, {}, creationId);
    if (result?.status === "done" && result.jobId) {
      if (result.facts?.vehicleName) setDraft((prev) => ({ ...prev, spawnName: prev.spawnName || snakeCase(String(result.facts!.vehicleName), "vehicle").slice(0, 32) }));
      if (hasArtifact(result.manifest, "preview.glb")) await loadPreview(result.jobId);
    }
  };

  const onLoadCreation = React.useCallback((c: CreationDetail) => {
    setCreationId(c.id);
    setDraft((prev) => ({ ...prev, ...((c.projectState ?? {}) as Partial<VehicleDraft>) }));
    const preview = c.projectState?.preview;
    if (preview?.jobId) { inspect.adopt(preview.jobId, preview.manifest, preview.facts, c.id); void loadPreview(preview.jobId); }
  }, [inspect, loadPreview, setDraft]);

  // Meshes in traversal order so components.json primitive indices resolve.
  const meshList = React.useMemo(() => {
    if (!model) return [] as THREE.Mesh[];
    const out: THREE.Mesh[] = [];
    model.object.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) out.push(m); });
    return out;
  }, [model]);

  const meshesFor = React.useCallback((info: ComponentInfo) => {
    if (info.primitiveIndices?.length) return info.primitiveIndices.map((i) => meshList[i]).filter(Boolean) as THREE.Mesh[];
    return meshList.filter((m) => m.name === info.name);
  }, [meshList]);

  const flatComponents = React.useMemo(() => flatten(components), [components]);

  // Reflect hidden/removed parts in the 3D preview.
  React.useEffect(() => {
    if (!model) return;
    const gone = new Set([...draft.hiddenParts, ...draft.removedParts]);
    for (const { info } of flatComponents) {
      const visible = !gone.has(info.name);
      for (const mesh of meshesFor(info)) mesh.visible = visible;
    }
  }, [model, draft.hiddenParts, draft.removedParts, flatComponents, meshesFor]);

  const toggle = (list: "hiddenParts" | "removedParts", name: string) => {
    setDraft((prev) => {
      const has = prev[list].includes(name);
      const next = has ? prev[list].filter((n) => n !== name) : [...prev[list], name];
      // A part cannot be both hidden and removed.
      const other = list === "hiddenParts" ? "removedParts" : "hiddenParts";
      return { ...prev, [list]: next, [other]: has ? prev[other] : prev[other].filter((n) => n !== name) } as VehicleDraft;
    });
  };

  const applyQuickFilter = (pattern: RegExp) => {
    const matches = flatComponents.filter(({ info }) => pattern.test(info.name)).map(({ info }) => info.name);
    if (!matches.length) { toast({ title: "Nothing matched", description: "This vehicle has no components with that naming." }); return; }
    setDraft((prev) => ({ ...prev, hiddenParts: Array.from(new Set([...prev.hiddenParts, ...matches])) }));
  };

  const nameError = draft.spawnName && !/^[a-z0-9_]{2,32}$/.test(draft.spawnName) ? "2–32 lowercase letters, numbers or underscores." : undefined;

  const buildExport = async (): Promise<ToolExportRequest | null> => {
    if (!/^[a-z0-9_]{2,32}$/.test(draft.spawnName)) {
      toast({ title: "Set the spawn name", description: "The vehicle spawn name is required, e.g. adder.", variant: "danger" });
      return null;
    }
    return {
      uploadIds: upload.uploadIds,
      config: {
        spawnName: draft.spawnName,
        hiddenParts: draft.hiddenParts,
        removedParts: draft.removedParts,
        wheels: { ...(draft.wheelModel ? { model: draft.wheelModel } : {}), width: draft.wheelWidth, offset: draft.wheelOffset },
        stance: { frontHeight: draft.frontHeight, rearHeight: draft.rearHeight, camber: draft.camber },
        glowTrim: { enabled: draft.glowEnabled, color: draft.glowColor },
        maxTextureSize: draft.maxTextureSize,
        lodBias: draft.lodBias,
      },
      name: draft.spawnName,
    };
  };

  const escrow = inspect.errorCode === "ESCROW_PROTECTED" || inspect.facts?.escrow === true;

  const left = (
    <div className="space-y-4">
      <UploadZone
        accept={[".yft", ".ytd", ".zip"]}
        onFiles={(files) => upload.add(files)}
        items={upload.items}
        onCancel={upload.cancel}
        onRetry={upload.retry}
        onRemove={(id) => void upload.remove(id)}
        hint="vehicle.yft, vehicle_hi.yft, vehicle.ytd — or the resource ZIP"
      />
      <Button className="w-full" disabled={!upload.uploadIds.length} loading={inspect.status === "running"} onClick={analyze}>
        <ScanSearch /> {model ? "Re-read vehicle" : "Read vehicle (free)"}
      </Button>
      {escrow ? (
        <Alert variant="danger" title="Escrow-protected vehicle">
          This vehicle is locked with FiveM asset escrow (.fxap), so its model and textures cannot be opened or edited. Ask the creator for an unlocked copy.
        </Alert>
      ) : inspect.status === "error" ? <Alert variant="danger" title="Could not read the vehicle">{inspect.error}</Alert> : null}
      {model ? (
        <dl className="space-y-1 border-t border-border pt-3 text-xs">
          <div className="flex justify-between"><dt className="text-fg-muted">Components</dt><dd className="tabular-nums">{flatComponents.length}</dd></div>
          <div className="flex justify-between"><dt className="text-fg-muted">Textures</dt><dd className="tabular-nums">{textures.length}</dd></div>
          {inspect.facts?.hasHiLod !== undefined ? <div className="flex justify-between"><dt className="text-fg-muted">_hi LOD</dt><dd>{inspect.facts.hasHiLod ? "present" : "missing"}</dd></div> : null}
        </dl>
      ) : null}
    </div>
  );

  const right = (
    <>
      <Panel title="Vehicle">
        <TextField label="Spawn name" mono value={draft.spawnName} error={nameError} onChange={(v) => setDraft({ spawnName: v.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32) })} hint="Used for the model, vehicles.meta and spawn command." />
      </Panel>

      <Panel title={`Components (${flatComponents.length})`}>
        <Row label="Quick filters" hint="Hide every part whose name matches.">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_FILTERS.map((f) => (
              <Button key={f.key} size="sm" variant="outline" disabled={!model} onClick={() => applyQuickFilter(f.pattern)}>{f.label}</Button>
            ))}
            <Button size="sm" variant="ghost" disabled={!draft.hiddenParts.length && !draft.removedParts.length} onClick={() => setDraft({ hiddenParts: [], removedParts: [] })}><Undo2 /> Reset</Button>
          </div>
        </Row>
        {flatComponents.length ? (
          <ul className="max-h-72 space-y-0.5 overflow-y-auto scrollbar-thin" aria-label="Vehicle components">
            {flatComponents.map(({ info, depth }) => {
              const hidden = draft.hiddenParts.includes(info.name);
              const removed = draft.removedParts.includes(info.name);
              return (
                <li key={`${info.name}-${depth}`} style={{ paddingLeft: depth * 10 }}>
                  <div className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs ${selectedMesh === info.name ? "bg-accent-soft" : ""}`}>
                    <button type="button" className={`min-w-0 flex-1 truncate text-left ${removed ? "text-fg-subtle line-through" : hidden ? "text-fg-subtle" : ""}`} onClick={() => setSelectedMesh(info.name)}>{info.name}</button>
                    <button type="button" aria-label={hidden ? `Show ${info.name}` : `Hide ${info.name}`} className="text-fg-subtle hover:text-fg" onClick={() => toggle("hiddenParts", info.name)}>
                      {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" aria-label={removed ? `Keep ${info.name}` : `Remove ${info.name}`} className={removed ? "text-danger" : "text-fg-subtle hover:text-danger"} onClick={() => toggle("removedParts", info.name)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-xs text-fg-subtle">Read a vehicle to list its components.</p>}
        <p className="text-[11px] text-fg-subtle">Hidden parts stay in the model but are invisible; removed parts are deleted from the geometry.</p>
      </Panel>

      <Panel title="Wheels">
        <SelectField label="Wheel model" value={draft.wheelModel} onChange={(v) => setDraft({ wheelModel: v })} options={WHEEL_MODELS} />
        <SliderField label="Width" value={draft.wheelWidth} min={0.5} max={2} onChange={(v) => setDraft({ wheelWidth: v })} format={(v) => `${v.toFixed(2)}×`} />
        <SliderField label="Offset" value={draft.wheelOffset} min={-0.2} max={0.2} step={0.005} onChange={(v) => setDraft({ wheelOffset: v })} format={(v) => `${v.toFixed(3)} m`} />
      </Panel>

      <Panel title="Stance">
        <SliderField label="Front height" value={draft.frontHeight} min={-0.2} max={0.2} step={0.005} onChange={(v) => setDraft({ frontHeight: v })} format={(v) => `${v.toFixed(3)} m`} />
        <SliderField label="Rear height" value={draft.rearHeight} min={-0.2} max={0.2} step={0.005} onChange={(v) => setDraft({ rearHeight: v })} format={(v) => `${v.toFixed(3)} m`} />
        <SliderField label="Camber" value={draft.camber} min={-15} max={15} step={0.5} onChange={(v) => setDraft({ camber: v })} format={(v) => `${v.toFixed(1)}°`} />
      </Panel>

      <Panel title="Glowing trim">
        <ToggleRow label="Enable glowing trim" hint="Adds an emissive shader to trim materials." checked={draft.glowEnabled} onChange={(v) => setDraft({ glowEnabled: v })} />
        {draft.glowEnabled ? <ColorField label="Glow colour" value={draft.glowColor} onChange={(v) => setDraft({ glowColor: v })} /> : null}
      </Panel>

      <Panel title="Optimization">
        <SelectField label="Texture size" value={String(draft.maxTextureSize)} onChange={(v) => setDraft({ maxTextureSize: Number(v) })} options={[512, 1024, 2048, 4096].map((n) => ({ value: String(n), label: `${n} × ${n}` }))} hint="Downscales anything larger when rebuilding the .ytd." />
        <SliderField label="LOD bias" value={draft.lodBias} min={0.5} max={2} step={0.05} onChange={(v) => setDraft({ lodBias: v })} format={(v) => `${v.toFixed(2)}×`} />
      </Panel>
    </>
  );

  return (
    <ToolFrame
      slug={SLUG}
      left={left}
      leftTitle="Vehicle files"
      right={right}
      buildExport={buildExport}
      exportLabel="Export vehicle"
      exportDisabled={!upload.uploadIds.length || !!nameError || escrow}
      exportDisabledReason={escrow ? "Escrow-protected vehicles cannot be exported." : !upload.uploadIds.length ? "Upload the vehicle files first." : nameError}
      projectState={draft}
      creationId={creationId}
      onLoadCreation={onLoadCreation}
      statusSlot={draft.removedParts.length || draft.hiddenParts.length ? <Badge variant="accent">{draft.hiddenParts.length} hidden · {draft.removedParts.length} removed</Badge> : null}
      shortcuts={[{ keys: "Click", label: "Select the component under the cursor" }]}
    >
      {inspect.status === "running" || loading ? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-bg-elevated text-sm text-fg-muted"><Spinner /> Reading fragments, components and textures…</div>
      ) : !model ? (
        <EmptyState icon={Car} title="Load an unlocked add-on vehicle" description="Upload the .yft/.ytd files or the resource ZIP and run the free read. Escrow-protected vehicles cannot be edited." />
      ) : (
        <Viewport
          object={model.object}
          onSelect={(mesh) => setSelectedMesh(mesh)}
          selectedMesh={selectedMesh}
          defaultPed
          className="h-[clamp(360px,62vh,820px)]"
        />
      )}
    </ToolFrame>
  );
}

export default VehicleEditorEditor;
