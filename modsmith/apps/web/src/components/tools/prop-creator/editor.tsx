"use client";
/**
 * Prop Creator editor. Also used by the AI Prop Creator once generation finishes (via `seed`),
 * so both tools share exactly the same editing and export pipeline.
 */
import * as React from "react";
import Link from "next/link";
import * as THREE from "three";
import { Boxes, Package, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Spinner } from "@/components/ui/misc";
import { NativeSelect } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { UploadZone } from "@/components/shared/upload-zone";
import { useUpload } from "@/hooks/use-upload";
import { errorMessage } from "@/components/app/hooks";
import { Viewport } from "@/components/three/viewport";
import type { GizmoMode, ViewportTransform } from "@/components/three/viewport";
import {
  countTriangles, decimateObject, exportGlb, glbFileName, loadGlbFromUrl, loadModelFromFiles, type LoadedModel,
} from "@/lib/three/loaders";
import { autoAssignTextures, isTextureFile, isZipFile, isModelFile } from "@/lib/three/texture-detect";
import { ToolFrame, type ToolExportRequest } from "../tool-frame";
import { ColorField, Panel, Row, SelectField, SliderField, TextField, ToggleRow, Vec3Field } from "../panels";
import { artifactUrl, blobToFile, snakeCase, uploadGenerated, useDraftState, useInspect, type CreationDetail } from "../lib";
import { SketchfabDialog, type SketchfabImportResult } from "./sketchfab-dialog";

const SLUG = "prop-creator";
const ACCEPT = [".obj", ".fbx", ".gltf", ".glb", ".dae", ".mtl", ".png", ".jpg", ".jpeg", ".dds", ".zip"];

type MaterialSettings = {
  baseColor?: string; normal?: string; roughness?: string; metalness?: string;
  color?: string; metallic?: number; roughnessValue?: number;
};

interface PropDraft extends Record<string, unknown> {
  propName: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  uniformScale: boolean;
  collision: "none" | "box" | "mesh";
  lodsAuto: boolean;
  lodHigh: number; lodMedium: number; lodLow: number; lodVeryLow: number;
  lodDistances: [number, number, number, number];
  decimation: number;
  targetTriangles: number | null;
  spawnScript: boolean;
  materials: Record<string, MaterialSettings>;
}

const INITIAL: PropDraft = {
  propName: "modsmith_prop",
  position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], uniformScale: true,
  collision: "box",
  lodsAuto: true, lodHigh: 1, lodMedium: 0.5, lodLow: 0.25, lodVeryLow: 0.1, lodDistances: [50, 100, 200, 500],
  decimation: 1, targetTriangles: null, spawnScript: true, materials: {},
};

export interface PropEditorSeed {
  /** Upload id the worker should build from (AI result or Sketchfab import). */
  uploadId: string;
  /** Job that produced `preview.glb`. */
  jobId: string;
  name?: string;
  attribution?: { model: string; author: string; license: string; sourceUrl: string };
}

export function PropCreatorEditor({ seed, toolSlug = SLUG, intro }: { seed?: PropEditorSeed | null; toolSlug?: string; intro?: React.ReactNode }) {
  const { toast } = useToast();
  const upload = useUpload(SLUG);
  const inspect = useInspect(SLUG);
  const [draft, setDraft] = useDraftState<PropDraft>(toolSlug, INITIAL);
  const [files, setFiles] = React.useState<File[]>([]);
  const [model, setModel] = React.useState<LoadedModel | null>(null);
  const [root, setRoot] = React.useState<THREE.Group | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [gizmo, setGizmo] = React.useState<GizmoMode>("none");
  const [selectedMaterial, setSelectedMaterial] = React.useState<string | null>(null);
  const [selectedMesh, setSelectedMesh] = React.useState<string | null>(null);
  const [lodPreview, setLodPreview] = React.useState<"off" | "medium" | "low" | "veryLow">("off");
  const [sketchfabOpen, setSketchfabOpen] = React.useState(false);
  const [external, setExternal] = React.useState<PropEditorSeed | null>(seed ?? null);
  const [creationId, setCreationId] = React.useState<string | null>(null);

  const zipUpload = upload.completed.find((i) => isZipFile(i.file.name));
  const hasClientModel = files.some((f) => isModelFile(f.name));

  // ── load the dropped model in the browser ──
  React.useEffect(() => {
    if (!hasClientModel) return;
    let cancelled = false;
    let loaded: LoadedModel | null = null;
    setLoading(true);
    setLoadError(null);
    loadModelFromFiles(files, { normalize: true })
      .then((m) => {
        if (cancelled) { m.dispose(); return; }
        loaded = m;
        const group = new THREE.Group();
        group.name = "prop_root";
        group.add(m.object);
        setModel(m);
        setRoot(group);
        setSelectedMaterial(m.materials[0] ?? null);
        if (m.warnings.length) toast({ title: "Model loaded with warnings", description: m.warnings[0] });
      })
      .catch((err) => { if (!cancelled) setLoadError(errorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; loaded?.dispose(); };
  }, [files, hasClientModel, toast]);

  // ── load a preview.glb produced by an inspect / import / AI job ──
  const previewJobId = external?.jobId ?? (inspect.status === "done" ? inspect.jobId : null);
  React.useEffect(() => {
    if (hasClientModel || !previewJobId) return;
    let cancelled = false;
    let loaded: LoadedModel | null = null;
    setLoading(true);
    setLoadError(null);
    artifactUrl(previewJobId, "preview.glb")
      .then((url) => loadGlbFromUrl(url, { normalize: true }))
      .then((m) => {
        if (cancelled) { m.dispose(); return; }
        loaded = m;
        const group = new THREE.Group();
        group.name = "prop_root";
        group.add(m.object);
        setModel(m);
        setRoot(group);
        setSelectedMaterial(m.materials[0] ?? null);
      })
      .catch((err) => { if (!cancelled) setLoadError(errorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; loaded?.dispose(); };
  }, [previewJobId, hasClientModel]);

  React.useEffect(() => { if (inspect.creationId) setCreationId(inspect.creationId); }, [inspect.creationId]);

  // ── textures available for material slots ──
  const textureUploads = React.useMemo(
    () => upload.completed.filter((i) => isTextureFile(i.file.name)).map((i) => ({ id: i.uploadId!, name: i.file.name, file: i.file })),
    [upload.completed],
  );

  // Auto-assign textures to materials by filename similarity the first time both sides exist.
  const autoAssigned = React.useRef<string>("");
  React.useEffect(() => {
    if (!model || !textureUploads.length) return;
    const key = `${model.materials.join("|")}::${textureUploads.map((t) => t.id).join("|")}`;
    if (autoAssigned.current === key) return;
    autoAssigned.current = key;
    const assignment = autoAssignTextures(model.materials, textureUploads.map((t) => t.name));
    setDraft((prev) => {
      const materials = { ...prev.materials };
      for (const [matName, slots] of Object.entries(assignment)) {
        const current = { ...(materials[matName] ?? {}) };
        for (const [slot, fileName] of Object.entries(slots)) {
          const up = textureUploads.find((t) => t.name === fileName);
          if (up && !current[slot as keyof MaterialSettings]) (current as Record<string, unknown>)[slot] = up.id;
        }
        materials[matName] = current;
      }
      return { ...prev, materials };
    });
  }, [model, textureUploads, setDraft]);

  // ── live material preview ──
  React.useEffect(() => {
    if (!model) return;
    for (const [name, settings] of Object.entries(draft.materials)) {
      model.object.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial | undefined;
          if (!std || std.name !== name) continue;
          if (settings.color && std.color) std.color.set(settings.color);
          if (typeof settings.metallic === "number") std.metalness = settings.metallic;
          if (typeof settings.roughnessValue === "number") std.roughness = settings.roughnessValue;
          std.needsUpdate = true;
        }
      });
    }
  }, [draft.materials, model]);

  const triangles = React.useMemo(() => (model ? countTriangles(model.object) : 0), [model]);
  const effectiveTriangles = Math.round(triangles * draft.decimation);

  const displayObject = React.useMemo(() => {
    if (!root) return null;
    if (lodPreview === "off") return root;
    const ratio = lodPreview === "medium" ? draft.lodMedium : lodPreview === "low" ? draft.lodLow : draft.lodVeryLow;
    const clone = decimateObject(root, ratio);
    clone.position.copy(root.position);
    clone.rotation.copy(root.rotation);
    clone.scale.copy(root.scale);
    return clone;
  }, [root, lodPreview, draft.lodMedium, draft.lodLow, draft.lodVeryLow]);

  const bounds = React.useMemo(() => {
    if (!model) return null;
    const box = new THREE.Box3().setFromObject(model.object);
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return { size: [size.x, size.y, size.z] as [number, number, number], center: [center.x, center.y, center.z] as [number, number, number] };
  }, [model]);

  const onTransform = React.useCallback((t: ViewportTransform) => {
    setDraft({ position: t.position, rotation: t.rotation, scale: t.scale });
  }, [setDraft]);

  // Keep the scene in sync when the numbers are edited by hand.
  React.useEffect(() => {
    if (!root) return;
    root.position.set(...draft.position);
    root.rotation.set(THREE.MathUtils.degToRad(draft.rotation[0]), THREE.MathUtils.degToRad(draft.rotation[1]), THREE.MathUtils.degToRad(draft.rotation[2]));
    root.scale.set(...draft.scale);
  }, [root, draft.position, draft.rotation, draft.scale]);

  const setScale = (v: [number, number, number], changedIndex?: number) => {
    if (draft.uniformScale && changedIndex !== undefined) {
      const s = v[changedIndex] ?? 1;
      setDraft({ scale: [s, s, s] });
    } else setDraft({ scale: v });
  };

  const onSketchfabImport = (r: SketchfabImportResult) => {
    setExternal({ uploadId: r.uploadId, jobId: r.jobId, name: r.attribution.model, attribution: r.attribution });
    setFiles([]);
    upload.reset();
    setDraft({ propName: snakeCase(r.attribution.model, "imported_prop").slice(0, 48) });
    toast({ title: "Model imported", description: "Attribution is kept with your export.", variant: "success" });
  };

  const analyzeZip = async () => {
    if (!zipUpload?.uploadId) return;
    const result = await inspect.start([zipUpload.uploadId], {}, creationId);
    if (result?.status === "error") toast({ title: "Could not read that archive", description: result.error ?? undefined, variant: "danger" });
  };

  const onLoadCreation = React.useCallback((c: CreationDetail) => {
    const state = (c.projectState ?? {}) as Partial<PropDraft> & { preview?: { jobId: string } };
    setCreationId(c.id);
    setDraft((prev) => ({ ...prev, ...(state as Partial<PropDraft>) }));
    if (state.preview?.jobId) setExternal((e) => e ?? { uploadId: "", jobId: state.preview!.jobId });
  }, [setDraft]);

  const buildExport = async (): Promise<ToolExportRequest | null> => {
    const uploadIds: string[] = [];
    if (hasClientModel && model) {
      const glb = await exportGlb(model.object);
      const glbId = await uploadGenerated(SLUG, blobToFile(glb, glbFileName(model.sourceName), "model/gltf-binary"));
      uploadIds.push(glbId, ...upload.uploadIds);
    } else if (external?.uploadId) {
      uploadIds.push(external.uploadId, ...upload.uploadIds);
    } else {
      uploadIds.push(...upload.uploadIds);
    }
    if (!uploadIds.length) {
      toast({ title: "Nothing to export", description: "Upload a model or import one first.", variant: "danger" });
      return null;
    }
    const materials = Object.entries(draft.materials)
      .filter(([name]) => !model || model.materials.includes(name))
      .map(([name, s]) => ({
        name,
        ...(s.baseColor ? { baseColor: s.baseColor } : {}),
        ...(s.normal ? { normal: s.normal } : {}),
        ...(s.roughness ? { roughness: s.roughness } : {}),
        ...(s.metalness ? { metalness: s.metalness } : {}),
        ...(s.color ? { color: s.color } : {}),
        ...(typeof s.metallic === "number" ? { metallic: s.metallic } : {}),
        ...(typeof s.roughnessValue === "number" ? { roughnessValue: s.roughnessValue } : {}),
      }));
    const config: Record<string, unknown> = {
      propName: snakeCase(draft.propName, "modsmith_prop").slice(0, 48),
      position: draft.position,
      rotation: draft.rotation,
      scale: draft.scale,
      collision: draft.collision,
      lods: {
        auto: draft.lodsAuto,
        high: draft.lodHigh, medium: draft.lodMedium, low: draft.lodLow, veryLow: draft.lodVeryLow,
        distances: draft.lodDistances,
      },
      decimation: draft.decimation,
      ...(draft.targetTriangles ? { targetTriangles: draft.targetTriangles } : {}),
      materials,
      spawnScript: draft.spawnScript,
      ...(external?.attribution ? { attribution: external.attribution } : {}),
    };
    return { uploadIds, config, name: draft.propName };
  };

  const nameError = /^[a-z0-9_]{3,48}$/.test(draft.propName) ? undefined : "Lowercase letters, numbers and underscores (3–48 characters).";
  const ready = !!(model || zipUpload || external?.uploadId || upload.uploadIds.length);

  const left = (
    <div className="space-y-4">
      <UploadZone
        accept={ACCEPT}
        onFiles={(list) => { setFiles((prev) => [...prev, ...list]); upload.add(list); }}
        items={upload.items}
        onCancel={upload.cancel}
        onRetry={upload.retry}
        onRemove={(id) => { const item = upload.items.find((i) => i.localId === id); if (item) setFiles((prev) => prev.filter((f) => f !== item.file)); void upload.remove(id); }}
        hint="Model + textures (OBJ, FBX, glTF, GLB, DAE) or a ZIP"
      />
      {zipUpload && !previewJobId ? (
        <Alert variant="info" title="Archive uploaded">
          <p>We unpack archives on our servers. Run a free analysis to get a 3D preview.</p>
          <Button size="sm" className="mt-2" loading={inspect.status === "running"} onClick={analyzeZip}><Boxes /> Analyze archive (free)</Button>
        </Alert>
      ) : null}
      {inspect.status === "running" ? <div className="flex items-center gap-2 text-xs text-fg-muted"><Spinner /> Building a preview…</div> : null}
      {inspect.status === "error" ? <Alert variant="danger">{inspect.error}</Alert> : null}
      {loadError ? <Alert variant="danger" title="Could not read the model">{loadError}</Alert> : null}
      {model?.warnings.length ? <Alert variant="warning" title="Heads up"><ul className="list-disc pl-4">{model.warnings.slice(0, 3).map((w) => <li key={w}>{w}</li>)}</ul></Alert> : null}

      <div className="space-y-2 border-t border-border pt-4">
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setSketchfabOpen(true)}><Package /> Import from Sketchfab</Button>
        <Button type="button" variant="ghost" size="sm" className="w-full" asChild><Link href="/app/tools/ai-prop-creator"><Sparkles /> Generate with AI</Link></Button>
      </div>

      {external?.attribution ? (
        <div className="rounded-md border border-border bg-bg-muted p-2.5 text-xs">
          <p className="font-medium">{external.attribution.model}</p>
          <p className="text-fg-muted">by {external.attribution.author}</p>
          <p className="mt-1 text-fg-subtle">{external.attribution.license}</p>
          <Button size="sm" variant="ghost" className="mt-1 px-0" onClick={() => setExternal(null)}><Trash2 /> Remove import</Button>
        </div>
      ) : null}

      {model ? (
        <dl className="space-y-1 border-t border-border pt-3 text-xs">
          <div className="flex justify-between"><dt className="text-fg-muted">Source</dt><dd className="truncate">{model.sourceName}</dd></div>
          <div className="flex justify-between"><dt className="text-fg-muted">Triangles</dt><dd className="tabular-nums">{triangles.toLocaleString("en-US")}</dd></div>
          <div className="flex justify-between"><dt className="text-fg-muted">Materials</dt><dd className="tabular-nums">{model.materials.length}</dd></div>
          {bounds ? <div className="flex justify-between"><dt className="text-fg-muted">Size</dt><dd className="tabular-nums">{bounds.size.map((n) => n.toFixed(2)).join(" × ")} m</dd></div> : null}
        </dl>
      ) : null}
    </div>
  );

  const materialSettings = selectedMaterial ? draft.materials[selectedMaterial] ?? {} : {};
  const setMaterial = (patch: Partial<MaterialSettings>) => {
    if (!selectedMaterial) return;
    setDraft((prev) => ({ ...prev, materials: { ...prev.materials, [selectedMaterial]: { ...(prev.materials[selectedMaterial] ?? {}), ...patch } } }));
  };
  const textureOptions = [{ value: "", label: "None" }, ...textureUploads.map((t) => ({ value: t.id, label: t.name }))];

  const right = (
    <>
      <Panel title="Prop">
        <TextField
          label="Prop name" mono value={draft.propName} error={nameError}
          hint="Used for the model, ytyp entry and spawn name."
          onChange={(v) => setDraft({ propName: v.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 48) })}
        />
        <ToggleRow label="Spawn script" hint="Adds a client script with a /spawn command for testing." checked={draft.spawnScript} onChange={(v) => setDraft({ spawnScript: v })} />
      </Panel>

      <Panel title="Transform" actions={<Button size="icon-sm" variant="ghost" aria-label="Reset transform" onClick={() => setDraft({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })}><RotateCcw /></Button>}>
        <Vec3Field label="Position (m)" value={draft.position} onChange={(v) => setDraft({ position: v })} />
        <Vec3Field label="Rotation (°)" step={1} value={draft.rotation} onChange={(v) => setDraft({ rotation: v })} />
        <ToggleRow label="Lock uniform scale" checked={draft.uniformScale} onChange={(v) => setDraft({ uniformScale: v })} />
        <Vec3Field label="Scale" value={draft.scale} onChange={(v) => { const i = v.findIndex((n, idx) => n !== draft.scale[idx]); setScale(v, i >= 0 ? i : undefined); }} />
        <p className="text-[11px] text-fg-subtle">Drag the gizmo in the viewport (W move · E rotate · R scale) or type exact numbers here.</p>
      </Panel>

      <Panel title="Collision">
        <SelectField
          label="Collision type" value={draft.collision} onChange={(v) => setDraft({ collision: v as PropDraft["collision"] })}
          options={[{ value: "none", label: "None (decorative)" }, { value: "box", label: "Box (fast)" }, { value: "mesh", label: "Mesh (accurate)" }]}
          hint={draft.collision === "mesh" ? "Mesh collision costs more server memory — use it for props players walk on." : draft.collision === "none" ? "Players and vehicles pass straight through." : "A single box built from the model bounds."}
        />
      </Panel>

      <Panel title="LODs">
        <ToggleRow label="Automatic LODs" hint="Let the builder pick ratios from the triangle count." checked={draft.lodsAuto} onChange={(v) => setDraft({ lodsAuto: v })} />
        <SliderField label="High" value={draft.lodHigh} min={0.05} max={1} onChange={(v) => setDraft({ lodHigh: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={draft.lodsAuto} />
        <SliderField label="Medium" value={draft.lodMedium} min={0.02} max={1} onChange={(v) => setDraft({ lodMedium: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={draft.lodsAuto} />
        <SliderField label="Low" value={draft.lodLow} min={0.01} max={1} onChange={(v) => setDraft({ lodLow: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={draft.lodsAuto} />
        <SliderField label="Very low" value={draft.lodVeryLow} min={0.005} max={1} onChange={(v) => setDraft({ lodVeryLow: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={draft.lodsAuto} />
        <Row label="Switch distances (m)">
          <div className="grid grid-cols-4 gap-1.5">
            {draft.lodDistances.map((d, i) => (
              <input
                key={i} type="number" aria-label={`LOD ${i + 1} distance`} value={d} min={1} max={2000}
                className="h-8 w-full rounded-md border border-border bg-bg-elevated px-1.5 text-xs tabular-nums"
                onChange={(e) => { const next = [...draft.lodDistances] as [number, number, number, number]; next[i] = Number(e.target.value) || 0; setDraft({ lodDistances: next }); }}
              />
            ))}
          </div>
        </Row>
        <Row label="Preview LOD" hint="Client-side approximation — the exported LODs are generated on our servers.">
          <NativeSelect className="h-8 text-xs" value={lodPreview} onChange={(e) => setLodPreview(e.target.value as typeof lodPreview)} disabled={!model}>
            <option value="off">High (original)</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="veryLow">Very low</option>
          </NativeSelect>
        </Row>
      </Panel>

      <Panel title="Optimization">
        <SliderField label="Decimation" value={draft.decimation} min={0.05} max={1} onChange={(v) => setDraft({ decimation: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <div className="flex items-center justify-between rounded-md border border-border bg-bg-muted px-2.5 py-2 text-xs">
          <span className="text-fg-muted">Triangles after decimation</span>
          <span className="tabular-nums">{effectiveTriangles.toLocaleString("en-US")}</span>
        </div>
        <Row label="Target triangles" hint="Optional hard cap; leave empty to use the decimation slider.">
          <input
            type="number" min={100} step={100} value={draft.targetTriangles ?? ""} placeholder="e.g. 20000"
            aria-label="Target triangles"
            className="h-8 w-full rounded-md border border-border bg-bg-elevated px-2 text-xs tabular-nums"
            onChange={(e) => setDraft({ targetTriangles: e.target.value ? Math.max(1, Number(e.target.value)) : null })}
          />
        </Row>
      </Panel>

      <Panel title="Materials" defaultOpen={!!model}>
        {!model ? <p className="text-xs text-fg-subtle">Load a model to see its materials.</p> : (
          <>
            <Row label="Material">
              <NativeSelect className="h-8 text-xs" value={selectedMaterial ?? ""} onChange={(e) => setSelectedMaterial(e.target.value || null)}>
                {model.materials.map((m) => <option key={m} value={m}>{m}</option>)}
              </NativeSelect>
            </Row>
            {selectedMaterial ? (
              <>
                <SelectField label="Base colour map" value={materialSettings.baseColor ?? ""} options={textureOptions} onChange={(v) => setMaterial({ baseColor: v || undefined })} />
                <SelectField label="Normal map" value={materialSettings.normal ?? ""} options={textureOptions} onChange={(v) => setMaterial({ normal: v || undefined })} />
                <SelectField label="Roughness map" value={materialSettings.roughness ?? ""} options={textureOptions} onChange={(v) => setMaterial({ roughness: v || undefined })} />
                <SelectField label="Metalness map" value={materialSettings.metalness ?? ""} options={textureOptions} onChange={(v) => setMaterial({ metalness: v || undefined })} />
                <ColorField label="Tint" value={materialSettings.color ?? "#ffffff"} onChange={(v) => setMaterial({ color: v })} />
                <SliderField label="Metallic" value={materialSettings.metallic ?? 0} min={0} max={1} onChange={(v) => setMaterial({ metallic: v })} />
                <SliderField label="Roughness" value={materialSettings.roughnessValue ?? 0.6} min={0} max={1} onChange={(v) => setMaterial({ roughnessValue: v })} />
                {!textureUploads.length ? <p className="text-[11px] text-fg-subtle">Upload PNG/JPG textures to fill these slots — we match them to materials by filename (_n, _r, _m…).</p> : null}
              </>
            ) : null}
          </>
        )}
      </Panel>
    </>
  );

  return (
    <>
      <ToolFrame
        slug={SLUG}
        left={left}
        right={right}
        buildExport={buildExport}
        exportDisabled={!ready || !!nameError}
        exportDisabledReason={!ready ? "Upload or import a model to enable export." : nameError}
        projectState={draft}
        creationId={creationId}
        onLoadCreation={onLoadCreation}
        statusSlot={model ? <Badge variant="success">{triangles.toLocaleString("en-US")} tris</Badge> : null}
        shortcuts={[{ keys: "Ctrl+S", label: "Save project (browser default)" }]}
        notice={intro}
      >
        <Viewport
          object={displayObject}
          gizmoEnabled
          gizmo={gizmo}
          onGizmoChange={setGizmo}
          transformTarget={root}
          onTransform={onTransform}
          onSelect={(mesh, material) => { setSelectedMesh(mesh); if (material) setSelectedMaterial(material); }}
          selectedMesh={selectedMesh}
          defaultPed
          loading={loading}
          loadingMessage="Reading your model…"
          emptyMessage="Drop an OBJ, FBX, glTF, GLB or DAE model (with its textures) to preview it here."
          className="h-[clamp(360px,64vh,820px)]"
        >
          {draft.collision === "box" && bounds ? (
            <mesh position={bounds.center} raycast={() => null}>
              <boxGeometry args={bounds.size} />
              <meshBasicMaterial color="#22c55e" wireframe transparent opacity={0.6} />
            </mesh>
          ) : null}
        </Viewport>
      </ToolFrame>
      <SketchfabDialog open={sketchfabOpen} onOpenChange={setSketchfabOpen} onImported={onSketchfabImport} />
    </>
  );
}

export default PropCreatorEditor;
