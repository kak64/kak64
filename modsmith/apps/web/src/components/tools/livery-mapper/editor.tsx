"use client";
/** Livery Mapper: design on the vehicle's real UV template with a live 3D preview. */
import * as React from "react";
import { Palette, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { UploadZone } from "@/components/shared/upload-zone";
import { useUpload } from "@/hooks/use-upload";
import { errorMessage } from "@/components/app/hooks";
import { Viewport } from "@/components/three/viewport";
import { loadGlbFromUrl, type LoadedModel } from "@/lib/three/loaders";
import { applyCanvasToMaterial } from "@/lib/three/uv";
import { LayerEditor, type Layer, type LayerEditorHandle } from "@/components/canvas/layer-editor";
import { ToolFrame, type ToolExportRequest } from "../tool-frame";
import { Panel, SelectField, TextField } from "../panels";
import { artifactBlobUrl, artifactJson, artifactUrl, blobToFile, hasArtifact, snakeCase, uploadGenerated, useDraftState, useInspect, type CreationDetail, type MaterialInfo } from "../lib";

const SLUG = "livery-mapper";
const ACCEPT = [".yft", ".ytd", ".zip", ".png", ".jpg"];
const BODY_HINT = /body|livery|paint|sign|skin|primary/i;

interface LiveryDraft extends Record<string, unknown> {
  vehicleName: string;
  liveryName: string;
  resolution: "1024" | "2048" | "4096";
  targetMaterial: string;
  layers: Layer[];
}

const INITIAL: LiveryDraft = { vehicleName: "", liveryName: "livery1", resolution: "2048", targetMaterial: "", layers: [] };

export function LiveryMapperEditor() {
  const { toast } = useToast();
  const upload = useUpload(SLUG);
  const inspect = useInspect(SLUG);
  const [draft, setDraft] = useDraftState<LiveryDraft>(SLUG, INITIAL);
  const [model, setModel] = React.useState<LoadedModel | null>(null);
  const [materials, setMaterials] = React.useState<MaterialInfo[]>([]);
  const [templateUrl, setTemplateUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [creationId, setCreationId] = React.useState<string | null>(null);
  const [fxapRejected, setFxapRejected] = React.useState<string | null>(null);
  const editorApi = React.useRef<LayerEditorHandle | null>(null);

  React.useEffect(() => { if (inspect.creationId) setCreationId(inspect.creationId); }, [inspect.creationId]);

  const loadPreview = React.useCallback(async (jobId: string) => {
    setLoading(true);
    try {
      const [glbUrl, mats] = await Promise.all([
        artifactUrl(jobId, "preview.glb"),
        artifactJson<MaterialInfo[]>(jobId, "materials.json").catch(() => [] as MaterialInfo[]),
      ]);
      const loaded = await loadGlbFromUrl(glbUrl);
      setModel(loaded);
      setMaterials(mats);
      const names = mats.length ? mats.map((m) => m.name) : loaded.materials;
      setDraft((prev) => ({ ...prev, targetMaterial: prev.targetMaterial || names.find((n) => BODY_HINT.test(n)) || names[0] || "" }));
      try { setTemplateUrl(await artifactBlobUrl(jobId, "uv-template.png")); } catch { setTemplateUrl(null); }
    } catch (err) {
      toast({ title: "Could not load the vehicle preview", description: errorMessage(err), variant: "danger" });
    } finally {
      setLoading(false);
    }
  }, [setDraft, toast]);

  const analyze = async () => {
    const ids = upload.uploadIds;
    if (!ids.length) return;
    setModel(null);
    setTemplateUrl(null);
    const result = await inspect.start(ids, {}, creationId);
    if (result?.status === "done" && result.jobId) {
      if (result.facts?.vehicleName) setDraft((prev) => ({ ...prev, vehicleName: prev.vehicleName || snakeCase(String(result.facts!.vehicleName), "vehicle").slice(0, 32) }));
      if (hasArtifact(result.manifest, "preview.glb")) await loadPreview(result.jobId);
    }
  };

  const onLoadCreation = React.useCallback((c: CreationDetail) => {
    setCreationId(c.id);
    setDraft((prev) => ({ ...prev, ...((c.projectState ?? {}) as Partial<LiveryDraft>) }));
    const preview = c.projectState?.preview;
    if (preview?.jobId) { inspect.adopt(preview.jobId, preview.manifest, preview.facts, c.id); void loadPreview(preview.jobId); }
  }, [inspect, loadPreview, setDraft]);

  const onComposite = React.useCallback((canvas: HTMLCanvasElement) => {
    if (model && draft.targetMaterial) applyCanvasToMaterial(model.object, draft.targetMaterial, canvas);
  }, [model, draft.targetMaterial]);

  const buildExport = async (): Promise<ToolExportRequest | null> => {
    if (!editorApi.current) return null;
    if (!/^[a-z0-9_]{2,32}$/.test(draft.vehicleName)) {
      toast({ title: "Set a spawn name", description: "The vehicle spawn name uses lowercase letters, numbers and underscores.", variant: "danger" });
      return null;
    }
    const png = await editorApi.current.exportPng(Number(draft.resolution));
    const textureKey = await uploadGenerated(SLUG, blobToFile(png, `${draft.liveryName || "livery1"}.png`, "image/png"));
    return {
      uploadIds: [...upload.uploadIds, textureKey],
      config: {
        vehicleName: draft.vehicleName,
        liveryName: draft.liveryName || "livery1",
        textureKey,
        resolution: draft.resolution,
      },
      name: `${draft.vehicleName} ${draft.liveryName}`.trim(),
    };
  };

  const materialNames = materials.length ? materials.map((m) => m.name) : model?.materials ?? [];
  const ready = !!model || !!templateUrl;

  const left = (
    <div className="space-y-4">
      <UploadZone
        accept={ACCEPT}
        onFiles={(files) => {
          const fxap = files.find((f) => /\.fxap$/i.test(f.name));
          if (fxap) { setFxapRejected(fxap.name); return; }
          setFxapRejected(null);
          upload.add(files);
        }}
        items={upload.items}
        onCancel={upload.cancel}
        onRetry={upload.retry}
        onRemove={(id) => void upload.remove(id)}
        hint="Vehicle .yft/.ytd or the whole resource ZIP"
      />
      {fxapRejected ? (
        <Alert variant="danger" title="Escrow-protected file">
          {fxapRejected} is protected by FiveM asset escrow (.fxap). Escrowed vehicles cannot be edited — ask the creator for an unlocked copy.
        </Alert>
      ) : null}
      <Button className="w-full" disabled={!upload.uploadIds.length} loading={inspect.status === "running"} onClick={analyze}>
        <ScanSearch /> {model ? "Re-read vehicle" : "Read vehicle (free)"}
      </Button>
      {inspect.status === "error" ? (
        <Alert variant="danger" title={inspect.errorCode === "ESCROW_PROTECTED" ? "Escrow-protected vehicle" : "Could not read the vehicle"}>
          {inspect.errorCode === "ESCROW_PROTECTED" ? "This resource is locked with FiveM asset escrow, so its model and textures cannot be opened." : inspect.error}
        </Alert>
      ) : null}
      {model ? <p className="text-xs text-fg-muted">{materialNames.length} materials · painting on <strong className="text-fg">{draft.targetMaterial || "—"}</strong></p> : null}
    </div>
  );

  const right = (
    <>
      <Panel title="Livery">
        <TextField label="Vehicle spawn name" mono value={draft.vehicleName} onChange={(v) => setDraft({ vehicleName: v.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32) })} hint="Must match the vehicle's spawn name, e.g. adder." error={draft.vehicleName && !/^[a-z0-9_]{2,32}$/.test(draft.vehicleName) ? "2–32 lowercase letters, numbers or underscores." : undefined} />
        <TextField label="Livery name" value={draft.liveryName} maxLength={48} onChange={(v) => setDraft({ liveryName: v })} />
        <SelectField label="Export resolution" value={draft.resolution} onChange={(v) => setDraft({ resolution: v as LiveryDraft["resolution"] })} options={[{ value: "1024", label: "1024 × 1024" }, { value: "2048", label: "2048 × 2048" }, { value: "4096", label: "4096 × 4096 (heavy)" }]} hint="4K liveries look sharp but cost four times the VRAM." />
      </Panel>
      <Panel title="Target material">
        {materialNames.length ? (
          <SelectField
            label="Paint onto"
            value={draft.targetMaterial}
            onChange={(v) => setDraft({ targetMaterial: v })}
            options={materialNames.map((n) => ({ value: n, label: n }))}
            hint="Pick the body material if the guess is wrong — the 3D preview updates instantly."
          />
        ) : <p className="text-xs text-fg-subtle">Read a vehicle to list its materials.</p>}
      </Panel>
    </>
  );

  return (
    <ToolFrame
      slug={SLUG}
      left={left}
      leftTitle="Vehicle"
      right={right}
      buildExport={buildExport}
      exportLabel="Export livery"
      exportDisabled={!ready || !draft.layers.length}
      exportDisabledReason={!ready ? "Read a vehicle to load its UV template." : !draft.layers.length ? "Add at least one layer to your livery." : undefined}
      projectState={{ vehicleName: draft.vehicleName, liveryName: draft.liveryName, resolution: draft.resolution, targetMaterial: draft.targetMaterial }}
      creationId={creationId}
      onLoadCreation={onLoadCreation}
      shortcuts={[{ keys: "Ctrl+Z / Ctrl+Shift+Z", label: "Undo / redo a design step" }, { keys: "Alt+↑ / Alt+↓", label: "Reorder the selected layer" }]}
    >
      {inspect.status === "running" || loading ? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-bg-elevated text-sm text-fg-muted"><Spinner /> Reading the vehicle&apos;s model, materials and UVs…</div>
      ) : !ready ? (
        <EmptyState icon={Palette} title="Load a vehicle to start designing" description="Upload the vehicle's .yft/.ytd files or its resource ZIP, then run the free read to get the real UV template and a 3D preview." />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <LayerEditor
            size={Number(draft.resolution)}
            underlay={templateUrl}
            layers={draft.layers}
            onLayersChange={(layers) => setDraft({ layers })}
            onChange={onComposite}
            apiRef={editorApi}
          />
          <Viewport
            object={model?.object ?? null}
            defaultGrid={false}
            emptyMessage="No 3D preview for this vehicle — the design still exports correctly."
            className="h-[clamp(260px,40vh,520px)] xl:h-auto"
          />
        </div>
      )}
    </ToolFrame>
  );
}

export default LiveryMapperEditor;
