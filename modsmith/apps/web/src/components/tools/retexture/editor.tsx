"use client";
/** Retexture: click a surface in 3D, swap its texture, fit and colour-correct it, rebuild the resource. */
import * as React from "react";
import { Layers, MousePointerClick, ScanSearch, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { UploadZone } from "@/components/shared/upload-zone";
import { useUpload } from "@/hooks/use-upload";
import { errorMessage } from "@/components/app/hooks";
import { Viewport } from "@/components/three/viewport";
import { loadGlbFromUrl, type LoadedModel } from "@/lib/three/loaders";
import { applyCanvasToMaterial, createCanvas } from "@/lib/three/uv";
import { ToolFrame, type ToolExportRequest } from "../tool-frame";
import { Panel, Row, SelectField, SliderField } from "../panels";
import { artifactBlobUrl, artifactJson, artifactUrl, hasArtifact, useDraftState, useInspect, type CreationDetail, type MaterialInfo, type TextureInfo } from "../lib";

const SLUG = "retexture";

interface Transform { scale: number; offsetX: number; offsetY: number; rotation: number; fit: "stretch" | "contain" | "cover" }
interface Adjustments { brightness: number; contrast: number; saturation: number; hue: number }
interface Replacement {
  id: string;
  material: string;
  texture: string;
  replacementKey: string;
  fileName: string;
  transform: Transform;
  adjustments: Adjustments;
}

const DEFAULT_TRANSFORM: Transform = { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, fit: "stretch" };
const DEFAULT_ADJUSTMENTS: Adjustments = { brightness: 0, contrast: 0, saturation: 0, hue: 0 };

interface RetextureDraft extends Record<string, unknown> {
  replacements: Replacement[];
}

/** Bake the transform + colour adjustments into a canvas we can use as a live CanvasTexture. */
function composeReplacement(img: HTMLImageElement, size: number, t: Transform, a: Adjustments) {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  ctx.filter = `brightness(${1 + a.brightness}) contrast(${1 + a.contrast}) saturate(${1 + a.saturation}) hue-rotate(${a.hue}deg)`;
  let w = size;
  let h = size;
  if (t.fit !== "stretch") {
    const ratio = t.fit === "contain" ? Math.min(size / img.width, size / img.height) : Math.max(size / img.width, size / img.height);
    w = img.width * ratio;
    h = img.height * ratio;
  }
  ctx.translate(size / 2 + t.offsetX * size, size / 2 + t.offsetY * size);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale, t.scale);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return canvas;
}

export function RetextureEditor() {
  const { toast } = useToast();
  const resourceUpload = useUpload(SLUG);
  const imageUpload = useUpload(SLUG);
  const inspect = useInspect(SLUG);
  const [draft, setDraft] = useDraftState<RetextureDraft>(SLUG, { replacements: [] });
  const [model, setModel] = React.useState<LoadedModel | null>(null);
  const [materials, setMaterials] = React.useState<MaterialInfo[]>([]);
  const [textures, setTextures] = React.useState<TextureInfo[]>([]);
  const [texturePreviews, setTexturePreviews] = React.useState<Record<string, string>>({});
  const [selectedMaterial, setSelectedMaterial] = React.useState<string | null>(null);
  const [selectedMesh, setSelectedMesh] = React.useState<string | null>(null);
  const [selectedTexture, setSelectedTexture] = React.useState<string>("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [creationId, setCreationId] = React.useState<string | null>(null);
  const jobIdRef = React.useRef<string | null>(null);

  React.useEffect(() => { if (inspect.creationId) setCreationId(inspect.creationId); }, [inspect.creationId]);

  const loadPreview = React.useCallback(async (jobId: string) => {
    setLoading(true);
    jobIdRef.current = jobId;
    try {
      const [glbUrl, mats, texs] = await Promise.all([
        artifactUrl(jobId, "preview.glb"),
        artifactJson<MaterialInfo[]>(jobId, "materials.json").catch(() => [] as MaterialInfo[]),
        artifactJson<TextureInfo[]>(jobId, "textures.json").catch(() => [] as TextureInfo[]),
      ]);
      setModel(await loadGlbFromUrl(glbUrl));
      setMaterials(mats);
      setTextures(texs);
    } catch (err) {
      toast({ title: "Could not load the preview", description: errorMessage(err), variant: "danger" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const analyze = async () => {
    if (!resourceUpload.uploadIds.length) return;
    setModel(null);
    const result = await inspect.start(resourceUpload.uploadIds, {}, creationId);
    if (result?.status === "done" && result.jobId && hasArtifact(result.manifest, "preview.glb")) await loadPreview(result.jobId);
  };

  const onLoadCreation = React.useCallback((c: CreationDetail) => {
    setCreationId(c.id);
    setDraft((prev) => ({ ...prev, ...((c.projectState ?? {}) as Partial<RetextureDraft>) }));
    const preview = c.projectState?.preview;
    if (preview?.jobId) { inspect.adopt(preview.jobId, preview.manifest, preview.facts, c.id); void loadPreview(preview.jobId); }
  }, [inspect, loadPreview, setDraft]);

  // Textures belonging to the selected material, per materials.json.
  const materialTextures = React.useMemo(() => {
    const info = materials.find((m) => m.name === selectedMaterial);
    return info?.textures ? Object.entries(info.textures).map(([sampler, name]) => ({ sampler, name })) : [];
  }, [materials, selectedMaterial]);

  React.useEffect(() => {
    setSelectedTexture(materialTextures[0]?.name ?? "");
  }, [materialTextures]);

  // Fetch the current texture PNG so the user sees what they are replacing.
  React.useEffect(() => {
    const jobId = jobIdRef.current;
    if (!jobId || !selectedTexture || texturePreviews[selectedTexture]) return;
    const info = textures.find((t) => t.name === selectedTexture);
    if (!info?.artifact) return;
    let cancelled = false;
    artifactBlobUrl(jobId, info.artifact)
      .then((url) => { if (!cancelled) setTexturePreviews((prev) => ({ ...prev, [selectedTexture]: url })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedTexture, textures, texturePreviews]);

  const active = draft.replacements.find((r) => r.id === activeId) ?? null;

  // Live preview of the active replacement on the mesh.
  React.useEffect(() => {
    if (!model || !active) return;
    const item = imageUpload.completed.find((i) => i.uploadId === active.replacementKey);
    if (!item) return;
    let cancelled = false;
    const url = URL.createObjectURL(item.file);
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const size = textures.find((t) => t.name === active.texture)?.width ?? 1024;
      applyCanvasToMaterial(model.object, active.material, composeReplacement(img, Math.min(2048, Math.max(256, size)), active.transform, active.adjustments));
      URL.revokeObjectURL(url);
    };
    img.src = url;
    return () => { cancelled = true; };
  }, [model, active, imageUpload.completed, textures]);

  const addReplacement = (uploadId: string, fileName: string) => {
    if (!selectedMaterial || !selectedTexture) {
      toast({ title: "Pick a surface first", description: "Click a surface in the 3D view, then choose which texture to replace.", variant: "danger" });
      return;
    }
    const id = `${selectedMaterial}:${selectedTexture}`;
    setDraft((prev) => ({
      ...prev,
      replacements: [
        ...prev.replacements.filter((r) => r.id !== id),
        { id, material: selectedMaterial, texture: selectedTexture, replacementKey: uploadId, fileName, transform: { ...DEFAULT_TRANSFORM }, adjustments: { ...DEFAULT_ADJUSTMENTS } },
      ],
    }));
    setActiveId(id);
  };

  // Attach freshly uploaded images to the selected surface.
  const handled = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const item of imageUpload.completed) {
      if (!item.uploadId || handled.current.has(item.uploadId)) continue;
      handled.current.add(item.uploadId);
      addReplacement(item.uploadId, item.file.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addReplacement depends on the current selection on purpose
  }, [imageUpload.completed]);

  const patchActive = (patch: Partial<Replacement>) => {
    if (!activeId) return;
    setDraft((prev) => ({ ...prev, replacements: prev.replacements.map((r) => (r.id === activeId ? { ...r, ...patch } : r)) }));
  };

  const buildExport = async (): Promise<ToolExportRequest | null> => {
    if (!draft.replacements.length) {
      toast({ title: "Nothing to replace yet", description: "Pick a surface and upload a replacement texture.", variant: "danger" });
      return null;
    }
    return {
      uploadIds: [...resourceUpload.uploadIds, ...draft.replacements.map((r) => r.replacementKey)],
      config: {
        replacements: draft.replacements.map((r) => ({
          material: r.material,
          texture: r.texture,
          replacementKey: r.replacementKey,
          transform: r.transform,
          adjustments: r.adjustments,
        })),
      },
      name: resourceUpload.completed[0]?.file.name.replace(/\.[^.]+$/, "") ?? "retexture",
    };
  };

  const materialNames = materials.length ? materials.map((m) => m.name) : model?.materials ?? [];

  const left = (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">Resource</h3>
        <UploadZone
          accept={[".ydr", ".yft", ".ytd", ".zip"]}
          onFiles={(files) => resourceUpload.add(files)}
          items={resourceUpload.items}
          onCancel={resourceUpload.cancel}
          onRetry={resourceUpload.retry}
          onRemove={(id) => void resourceUpload.remove(id)}
          hint="Prop, MLO or vehicle files, or the whole ZIP"
        />
        <Button className="mt-3 w-full" disabled={!resourceUpload.uploadIds.length} loading={inspect.status === "running"} onClick={analyze}>
          <ScanSearch /> {model ? "Re-read resource" : "Read resource (free)"}
        </Button>
      </div>
      {inspect.status === "error" ? (
        <Alert variant="danger" title={inspect.errorCode === "ESCROW_PROTECTED" ? "Escrow-protected resource" : "Could not read the resource"}>
          {inspect.errorCode === "ESCROW_PROTECTED" ? "This resource is locked with FiveM asset escrow and cannot be retextured." : inspect.error}
        </Alert>
      ) : null}
      {model ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">Replacement image</h3>
          <UploadZone
            accept={[".png", ".jpg", ".jpeg", ".dds"]}
            onFiles={(files) => imageUpload.add(files)}
            items={imageUpload.items}
            onCancel={imageUpload.cancel}
            onRetry={imageUpload.retry}
            onRemove={(id) => void imageUpload.remove(id)}
            hint={selectedMaterial ? `Replaces ${selectedTexture || "the selected texture"}` : "Select a surface in 3D first"}
            disabled={!selectedMaterial}
          />
        </div>
      ) : null}
    </div>
  );

  const right = (
    <>
      <Panel title="Surface">
        {materialNames.length ? (
          <>
            <SelectField label="Material" value={selectedMaterial ?? ""} onChange={(v) => setSelectedMaterial(v || null)} options={[{ value: "", label: "— pick a surface —" }, ...materialNames.map((n) => ({ value: n, label: n }))]} hint="Or just click the surface in the 3D view." />
            {materialTextures.length ? (
              <SelectField label="Texture" value={selectedTexture} onChange={setSelectedTexture} options={materialTextures.map((t) => ({ value: t.name, label: `${t.name} (${t.sampler})` }))} />
            ) : selectedMaterial ? <p className="text-[11px] text-fg-subtle">No texture list for this material — the worker will match by name.</p> : null}
            {selectedTexture && texturePreviews[selectedTexture] ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived blob URL of an extracted texture
              <img src={texturePreviews[selectedTexture]} alt={`Current texture ${selectedTexture}`} className="w-full rounded border border-border bg-bg-muted" />
            ) : null}
          </>
        ) : <p className="text-xs text-fg-subtle">Read a resource to list its surfaces.</p>}
      </Panel>

      <Panel title={`Replacements (${draft.replacements.length})`}>
        {draft.replacements.length ? (
          <ul className="space-y-1.5">
            {draft.replacements.map((r) => (
              <li key={r.id}>
                <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${activeId === r.id ? "border-accent bg-accent-soft" : "border-border"}`}>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setActiveId(r.id); setSelectedMaterial(r.material); setSelectedTexture(r.texture); }}>
                    <span className="block truncate font-medium">{r.texture}</span>
                    <span className="block truncate text-[11px] text-fg-subtle">{r.material} ← {r.fileName}</span>
                  </button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove replacement for ${r.texture}`} onClick={() => { setDraft((prev) => ({ ...prev, replacements: prev.replacements.filter((x) => x.id !== r.id) })); if (activeId === r.id) setActiveId(null); }}><Trash2 /></Button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-fg-subtle">Upload a replacement image to add one.</p>}
      </Panel>

      {active ? (
        <>
          <Panel title="Fit &amp; transform">
            <SelectField label="Fit" value={active.transform.fit} onChange={(v) => patchActive({ transform: { ...active.transform, fit: v as Transform["fit"] } })} options={[{ value: "stretch", label: "Stretch to UV" }, { value: "contain", label: "Contain" }, { value: "cover", label: "Cover" }]} />
            <SliderField label="Scale" value={active.transform.scale} min={0.1} max={4} step={0.01} onChange={(v) => patchActive({ transform: { ...active.transform, scale: v } })} format={(v) => `${v.toFixed(2)}×`} />
            <SliderField label="Offset X" value={active.transform.offsetX} min={-1} max={1} step={0.005} onChange={(v) => patchActive({ transform: { ...active.transform, offsetX: v } })} />
            <SliderField label="Offset Y" value={active.transform.offsetY} min={-1} max={1} step={0.005} onChange={(v) => patchActive({ transform: { ...active.transform, offsetY: v } })} />
            <SliderField label="Rotation" value={active.transform.rotation} min={-180} max={180} step={1} onChange={(v) => patchActive({ transform: { ...active.transform, rotation: v } })} format={(v) => `${Math.round(v)}°`} />
          </Panel>
          <Panel title="Colour">
            <SliderField label="Brightness" value={active.adjustments.brightness} min={-1} max={1} onChange={(v) => patchActive({ adjustments: { ...active.adjustments, brightness: v } })} />
            <SliderField label="Contrast" value={active.adjustments.contrast} min={-1} max={1} onChange={(v) => patchActive({ adjustments: { ...active.adjustments, contrast: v } })} />
            <SliderField label="Saturation" value={active.adjustments.saturation} min={-1} max={1} onChange={(v) => patchActive({ adjustments: { ...active.adjustments, saturation: v } })} />
            <SliderField label="Hue" value={active.adjustments.hue} min={-180} max={180} step={1} onChange={(v) => patchActive({ adjustments: { ...active.adjustments, hue: v } })} format={(v) => `${Math.round(v)}°`} />
            <Row label=""><Button size="sm" variant="outline" onClick={() => patchActive({ transform: { ...DEFAULT_TRANSFORM }, adjustments: { ...DEFAULT_ADJUSTMENTS } })}>Reset adjustments</Button></Row>
          </Panel>
        </>
      ) : null}
    </>
  );

  return (
    <ToolFrame
      slug={SLUG}
      left={left}
      leftTitle="Files"
      right={right}
      buildExport={buildExport}
      exportLabel="Rebuild resource"
      exportDisabled={!draft.replacements.length}
      exportDisabledReason={!draft.replacements.length ? "Add at least one texture replacement." : undefined}
      projectState={draft}
      creationId={creationId}
      onLoadCreation={onLoadCreation}
      statusSlot={draft.replacements.length ? <Badge variant="accent">{draft.replacements.length} replacement{draft.replacements.length === 1 ? "" : "s"}</Badge> : null}
      shortcuts={[{ keys: "Click", label: "Pick the surface under the cursor" }]}
    >
      {inspect.status === "running" || loading ? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-bg-elevated text-sm text-fg-muted"><Spinner /> Extracting model, materials and textures…</div>
      ) : !model ? (
        <EmptyState icon={Layers} title="Load a prop, MLO or vehicle" description="Upload the files or the whole resource ZIP, then run the free read. You can then click any surface to swap its texture." />
      ) : (
        <>
          <Viewport
            object={model.object}
            onSelect={(mesh, material) => { setSelectedMesh(mesh); if (material) setSelectedMaterial(material); }}
            selectedMesh={selectedMesh}
            className="h-[clamp(360px,62vh,820px)]"
          />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted"><MousePointerClick className="h-3.5 w-3.5" aria-hidden /> Click a surface to select its material, then upload a replacement on the left.</p>
        </>
      )}
    </ToolFrame>
  );
}

export default RetextureEditor;
