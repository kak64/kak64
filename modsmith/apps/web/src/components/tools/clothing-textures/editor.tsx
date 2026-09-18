"use client";
/** Clothing Textures: paint garment UVs with layers and a brush, export texture variants a–z. */
import * as React from "react";
import * as THREE from "three";
import { Copy, Plus, ScanSearch, Shirt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Alert, Spinner } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { UploadZone } from "@/components/shared/upload-zone";
import { useUpload } from "@/hooks/use-upload";
import { errorMessage } from "@/components/app/hooks";
import { Viewport } from "@/components/three/viewport";
import { buildGarmentPlaceholder, disposeGroup, type Gender } from "@/components/three/procedural";
import { loadGlbFromUrl, type LoadedModel } from "@/lib/three/loaders";
import { applyCanvasToMaterial, renderUvTemplate } from "@/lib/three/uv";
import { LayerEditor, type Layer, type LayerEditorHandle } from "@/components/canvas/layer-editor";
import { renderLayersOffscreen } from "@/components/canvas/render";
import { canvasToPngBlob } from "@/lib/three/uv";
import { ToolFrame, type ToolExportRequest } from "../tool-frame";
import { Panel, Row, SelectField, TextField } from "../panels";
import { artifactBlobUrl, artifactUrl, blobToFile, hasArtifact, snakeCase, uploadGenerated, useDraftState, useInspect, type CreationDetail } from "../lib";
import { GARMENT_CATEGORIES, garmentCategory } from "../library/garments";

const SLUG = "clothing-textures";
const VARIANT_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

interface Variant { id: string; name: string; layers: Layer[] }

interface ClothingDraft extends Record<string, unknown> {
  resourceName: string;
  gender: Gender;
  component: string;
  garmentSource: "library" | "upload";
  garmentId: string;
  variants: Variant[];
  activeVariant: string;
}

function newVariant(index: number): Variant {
  const letter = VARIANT_LETTERS[index % 26] ?? "a";
  return { id: `v_${letter}_${Date.now().toString(36)}`, name: letter, layers: [] };
}

const FIRST = newVariant(0);
const INITIAL: ClothingDraft = {
  resourceName: "modsmith_clothing",
  gender: "male",
  component: "jbib",
  garmentSource: "library",
  garmentId: "m_jbib_tshirt",
  variants: [FIRST],
  activeVariant: FIRST.id,
};

export function ClothingTexturesEditor() {
  const { toast } = useToast();
  const upload = useUpload(SLUG);
  const inspect = useInspect(SLUG);
  const [draft, setDraft] = useDraftState<ClothingDraft>(SLUG, INITIAL);
  const [model, setModel] = React.useState<LoadedModel | null>(null);
  const [placeholder, setPlaceholder] = React.useState<THREE.Group | null>(null);
  const [template, setTemplate] = React.useState<HTMLCanvasElement | string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [creationId, setCreationId] = React.useState<string | null>(null);
  const editorApi = React.useRef<LayerEditorHandle | null>(null);

  const category = garmentCategory(draft.component);
  const templateSize = category.templateSize;
  const items = category.items[draft.gender];

  React.useEffect(() => { if (inspect.creationId) setCreationId(inspect.creationId); }, [inspect.creationId]);

  // Library garment → placeholder mesh + a UV template generated from its own UVs.
  React.useEffect(() => {
    if (draft.garmentSource !== "library") return;
    const group = buildGarmentPlaceholder(category.shape, draft.gender);
    setPlaceholder(group);
    setModel(null);
    setTemplate(renderUvTemplate(group, "garment", { size: templateSize, line: "rgba(255,255,255,0.45)" }));
    return () => { disposeGroup(group); };
  }, [draft.garmentSource, draft.gender, category.shape, templateSize]);

  const loadPreview = React.useCallback(async (jobId: string) => {
    setLoading(true);
    try {
      const glbUrl = await artifactUrl(jobId, "preview.glb");
      const loaded = await loadGlbFromUrl(glbUrl, { normalize: true });
      setModel(loaded);
      setPlaceholder(null);
      try { setTemplate(await artifactBlobUrl(jobId, "uv-template.png")); }
      catch { setTemplate(renderUvTemplate(loaded.object, undefined, { size: templateSize })); }
    } catch (err) {
      toast({ title: "Could not load the garment", description: errorMessage(err), variant: "danger" });
    } finally {
      setLoading(false);
    }
  }, [templateSize, toast]);

  const analyze = async () => {
    if (!upload.uploadIds.length) return;
    const result = await inspect.start(upload.uploadIds, { component: draft.component, gender: draft.gender }, creationId);
    if (result?.status === "done" && result.jobId && hasArtifact(result.manifest, "preview.glb")) await loadPreview(result.jobId);
  };

  const onLoadCreation = React.useCallback((c: CreationDetail) => {
    setCreationId(c.id);
    setDraft((prev) => ({ ...prev, ...((c.projectState ?? {}) as Partial<ClothingDraft>) }));
    const preview = c.projectState?.preview;
    if (preview?.jobId) { inspect.adopt(preview.jobId, preview.manifest, preview.facts, c.id); void loadPreview(preview.jobId); }
  }, [inspect, loadPreview, setDraft]);

  const previewObject = model?.object ?? placeholder ?? null;
  const previewMaterial = model ? model.materials[0] ?? "garment" : "garment";

  const onComposite = React.useCallback((canvas: HTMLCanvasElement) => {
    if (previewObject) applyCanvasToMaterial(previewObject, previewMaterial, canvas);
  }, [previewObject, previewMaterial]);

  const active = draft.variants.find((v) => v.id === draft.activeVariant) ?? draft.variants[0]!;

  const setVariantLayers = (layers: Layer[]) => {
    setDraft((prev) => ({ ...prev, variants: prev.variants.map((v) => (v.id === active.id ? { ...v, layers } : v)) }));
  };

  const addVariant = () => {
    if (draft.variants.length >= 26) { toast({ title: "Variant limit reached", description: "A clothing resource supports 26 texture variants (a–z)." }); return; }
    const v = newVariant(draft.variants.length);
    setDraft((prev) => ({ ...prev, variants: [...prev.variants, v], activeVariant: v.id }));
  };
  const duplicateVariant = () => {
    if (draft.variants.length >= 26) return;
    const v = { ...newVariant(draft.variants.length), layers: JSON.parse(JSON.stringify(active.layers)) as Layer[] };
    setDraft((prev) => ({ ...prev, variants: [...prev.variants, v], activeVariant: v.id }));
  };
  const removeVariant = (id: string) => {
    if (draft.variants.length <= 1) return;
    setDraft((prev) => {
      const variants = prev.variants.filter((v) => v.id !== id);
      return { ...prev, variants, activeVariant: prev.activeVariant === id ? variants[0]!.id : prev.activeVariant };
    });
  };

  const buildExport = async (): Promise<ToolExportRequest | null> => {
    if (!/^[a-z0-9_]{3,32}$/.test(draft.resourceName)) {
      toast({ title: "Check the resource name", description: "3–32 lowercase letters, numbers or underscores.", variant: "danger" });
      return null;
    }
    const usable = draft.variants.filter((v) => v.layers.length);
    if (!usable.length) {
      toast({ title: "Nothing to export", description: "Add artwork to at least one variant.", variant: "danger" });
      return null;
    }
    const variants: { name: string; textureKey: string }[] = [];
    for (const v of usable) {
      const canvas = v.id === active.id && editorApi.current?.getComposite() ? editorApi.current.getComposite()! : await renderLayersOffscreen(v.layers, templateSize);
      const blob = await canvasToPngBlob(canvas, templateSize);
      const key = await uploadGenerated(SLUG, blobToFile(blob, `${draft.resourceName}_${v.name}.png`, "image/png"));
      variants.push({ name: v.name.slice(0, 32), textureKey: key });
    }
    return {
      uploadIds: [...upload.uploadIds, ...variants.map((v) => v.textureKey)],
      config: {
        resourceName: draft.resourceName,
        gender: draft.gender,
        component: draft.component,
        garmentSource: draft.garmentSource,
        ...(draft.garmentSource === "library" ? { garmentId: draft.garmentId } : {}),
        variants,
      },
      name: draft.resourceName,
    };
  };

  const left = (
    <div className="space-y-4">
      <Tabs value={draft.garmentSource} onValueChange={(v) => setDraft({ garmentSource: v as ClothingDraft["garmentSource"] })}>
        <TabsList className="w-full">
          <TabsTrigger value="library" className="flex-1">Library</TabsTrigger>
          <TabsTrigger value="upload" className="flex-1">My files</TabsTrigger>
        </TabsList>
      </Tabs>

      {draft.garmentSource === "library" ? (
        <div className="space-y-3">
          <SelectField label="Slot" value={draft.component} onChange={(v) => { const cat = garmentCategory(v); setDraft({ component: v, garmentId: cat.items[draft.gender][0]?.id ?? "" }); }} options={GARMENT_CATEGORIES.map((c) => ({ value: c.component, label: `${c.label} (${c.slot === "prop" ? "prop " : ""}${c.componentId})` }))} />
          <SelectField label="Garment" value={draft.garmentId} onChange={(v) => setDraft({ garmentId: v })} options={items.map((i) => ({ value: i.id, label: `${i.name} · drawable ${i.drawableId}` }))} />
          <Alert variant="info">Base-game meshes are not shipped with Modsmith. You are designing on a stand-in garment with the correct {templateSize}² UV template — the real drawable is used when the resource is built.</Alert>
        </div>
      ) : (
        <div className="space-y-3">
          <UploadZone
            accept={[".ydd", ".ytd", ".zip"]}
            onFiles={(files) => upload.add(files)}
            items={upload.items}
            onCancel={upload.cancel}
            onRetry={upload.retry}
            onRemove={(id) => void upload.remove(id)}
            hint="Your garment .ydd/.ytd or a resource ZIP"
          />
          <Button className="w-full" disabled={!upload.uploadIds.length} loading={inspect.status === "running"} onClick={analyze}>
            <ScanSearch /> {model ? "Re-read garment" : "Read garment (free)"}
          </Button>
          {inspect.status === "error" ? <Alert variant="danger" title="Could not read the garment">{inspect.error}</Alert> : null}
        </div>
      )}
    </div>
  );

  const right = (
    <>
      <Panel title="Resource">
        <TextField label="Resource name" mono value={draft.resourceName} onChange={(v) => setDraft({ resourceName: snakeCase(v, "modsmith_clothing").slice(0, 32) })} hint="Folder name of the exported clothing resource." />
        <SelectField label="Gender" value={draft.gender} onChange={(v) => { const g = v as Gender; setDraft({ gender: g, garmentId: garmentCategory(draft.component).items[g][0]?.id ?? "" }); }} options={[{ value: "male", label: "Male (mp_m_freemode_01)" }, { value: "female", label: "Female (mp_f_freemode_01)" }]} />
        <Row label="Component"><p className="rounded-md border border-border bg-bg-muted px-2 py-1.5 font-mono text-xs">{draft.component} · id {category.componentId} · {category.slot}</p></Row>
      </Panel>

      <Panel title={`Variants (${draft.variants.length}/26)`}>
        <ul className="space-y-1.5">
          {draft.variants.map((v) => (
            <li key={v.id} className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 ${v.id === active.id ? "border-accent bg-accent-soft" : "border-border"}`}>
              <button type="button" className="shrink-0 font-mono text-xs uppercase" onClick={() => setDraft({ activeVariant: v.id })} aria-label={`Edit variant ${v.name}`}>{v.name}</button>
              <Input className="h-7 flex-1 text-xs" value={v.name} maxLength={32} aria-label={`Variant ${v.name} name`} onChange={(e) => setDraft((prev) => ({ ...prev, variants: prev.variants.map((x) => (x.id === v.id ? { ...x, name: e.target.value } : x)) }))} />
              <span className="shrink-0 text-[11px] text-fg-subtle tabular-nums">{v.layers.length}</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Delete variant ${v.name}`} disabled={draft.variants.length <= 1} onClick={() => removeVariant(v.id)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={addVariant}><Plus /> Add</Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={duplicateVariant}><Copy /> Duplicate</Button>
        </div>
      </Panel>

      <Panel title="3D preview">
        <Row label="Preview gender">
          <NativeSelect className="h-8 text-xs" value={draft.gender} onChange={(e) => setDraft({ gender: e.target.value as Gender })}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </NativeSelect>
        </Row>
        <p className="text-[11px] text-fg-subtle">The 3D view updates as you paint. Use the brush and eraser for freehand work; images, text and shapes stay editable.</p>
      </Panel>
    </>
  );

  return (
    <ToolFrame
      slug={SLUG}
      left={left}
      leftTitle="Garment"
      right={right}
      buildExport={buildExport}
      exportLabel="Export clothing"
      exportDisabled={!draft.variants.some((v) => v.layers.length)}
      exportDisabledReason={!draft.variants.some((v) => v.layers.length) ? "Add artwork to at least one variant." : undefined}
      projectState={{ resourceName: draft.resourceName, gender: draft.gender, component: draft.component, garmentSource: draft.garmentSource, garmentId: draft.garmentId }}
      creationId={creationId}
      onLoadCreation={onLoadCreation}
      statusSlot={<Badge variant="accent">{draft.variants.length} variant{draft.variants.length === 1 ? "" : "s"}</Badge>}
      shortcuts={[{ keys: "Ctrl+Z / Ctrl+Shift+Z", label: "Undo / redo" }, { keys: "Alt+↑ / Alt+↓", label: "Reorder the selected layer" }]}
    >
      {loading || inspect.status === "running" ? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-bg-elevated text-sm text-fg-muted"><Spinner /> Reading the garment…</div>
      ) : !previewObject ? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-bg-elevated text-center text-sm text-fg-muted">
          <Shirt className="h-6 w-6" aria-hidden /> Pick a library garment or upload your own to start painting.
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <LayerEditor
            key={active.id}
            size={templateSize}
            underlay={template}
            layers={active.layers}
            onLayersChange={setVariantLayers}
            onChange={onComposite}
            apiRef={editorApi}
            brush
          />
          <Viewport
            object={previewObject}
            defaultPed={false}
            cameraDistanceHint={0.7}
            emptyMessage="No preview available."
            className="h-[clamp(260px,40vh,520px)] xl:h-auto"
          />
        </div>
      )}
    </ToolFrame>
  );
}

export default ClothingTexturesEditor;
