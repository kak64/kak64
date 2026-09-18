"use client";
/** Face Skin Creator: align a headshot to the head UV by hand, tune the skin, preview on a head mesh. */
import * as React from "react";
import * as THREE from "three";
import { ScanFace } from "lucide-react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { UploadZone } from "@/components/shared/upload-zone";
import { useUpload } from "@/hooks/use-upload";
import { Viewport } from "@/components/three/viewport";
import { buildHead, disposeGroup, type Gender } from "@/components/three/procedural";
import { applyCanvasToMaterial, createCanvas } from "@/lib/three/uv";
import { ToolFrame, type ToolExportRequest } from "../tool-frame";
import { Panel, SelectField, SliderField } from "../panels";
import { useDraftState, type CreationDetail } from "../lib";
import type { JobEstimate } from "../tool-frame";

const SLUG = "face-skin-creator";
const TEX = 1024;
/** Where the face lands on the head sphere's UV (u = 0.25 is the front). */
const FACE_U = 0.25;
const FACE_V = 0.42;

interface FaceDraft extends Record<string, unknown> {
  gender: Gender;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  brightness: number;
  contrast: number;
  warmth: number;
  blend: number;
}

const INITIAL: FaceDraft = { gender: "male", x: 0, y: 0, scale: 1, rotation: 0, brightness: 0, contrast: 0, warmth: 0, blend: 0.6 };

function skinFilter(d: FaceDraft) {
  const sepia = Math.max(0, d.warmth);
  const hue = d.warmth < 0 ? d.warmth * 25 : 0;
  return `brightness(${1 + d.brightness}) contrast(${1 + d.contrast}) sepia(${sepia.toFixed(2)}) hue-rotate(${hue.toFixed(0)}deg)`;
}

export function FaceSkinCreatorEditor() {
  const { toast } = useToast();
  const upload = useUpload(SLUG);
  const [draft, setDraft] = useDraftState<FaceDraft>(SLUG, INITIAL);
  const [creationId, setCreationId] = React.useState<string | null>(null);
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  const [head, setHead] = React.useState<{ object: THREE.Group } | null>(null);
  const [estimate, setEstimate] = React.useState<JobEstimate | null>(null);
  const alignRef = React.useRef<HTMLCanvasElement>(null);
  const texture = React.useRef<HTMLCanvasElement | null>(null);
  const dragging = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const photo = upload.completed[0];

  React.useEffect(() => {
    const built = buildHead(draft.gender);
    setHead(built);
    return () => disposeGroup(built.object);
  }, [draft.gender]);

  React.useEffect(() => {
    api<JobEstimate>(`/api/v1/tools/${SLUG}/estimate`, { json: { uploadIds: [], config: {} } })
      .then(setEstimate)
      .catch(() => setEstimate(null));
  }, []);

  React.useEffect(() => {
    if (!photo) { setImage(null); return; }
    const url = URL.createObjectURL(photo.file);
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // Alignment canvas + head texture are drawn from the same transform.
  const redraw = React.useCallback(() => {
    const canvas = alignRef.current;
    if (!canvas) return;
    const size = canvas.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#12151c";
    ctx.fillRect(0, 0, size, size);
    if (image) {
      ctx.save();
      ctx.filter = skinFilter(draft);
      ctx.translate(size / 2 + draft.x * size, size / 2 + draft.y * size);
      ctx.rotate((draft.rotation * Math.PI) / 180);
      const base = size * 0.9 * draft.scale;
      const ratio = image.width / image.height || 1;
      const w = ratio >= 1 ? base * ratio : base;
      const h = ratio >= 1 ? base : base / ratio;
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    // oval guide
    ctx.save();
    ctx.strokeStyle = "rgba(249,115,22,0.9)";
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(size / 2, size * 0.5, size * 0.27, size * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(size * 0.2, size * 0.46); ctx.lineTo(size * 0.8, size * 0.46); ctx.stroke();
    ctx.restore();

    // head texture: the aligned face painted onto the skin base at the front of the UV sphere
    if (!texture.current) texture.current = createCanvas(TEX, TEX / 2);
    const tex = texture.current;
    const tctx = tex.getContext("2d");
    if (tctx && head) {
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.fillStyle = "#d3b39a";
      tctx.fillRect(0, 0, tex.width, tex.height);
      if (image) {
        const fw = tex.width * 0.22 * draft.scale;
        const fh = fw * 1.25;
        tctx.save();
        tctx.globalAlpha = draft.blend;
        tctx.filter = skinFilter(draft);
        tctx.translate(FACE_U * tex.width + draft.x * fw, FACE_V * tex.height + draft.y * fh);
        tctx.rotate((draft.rotation * Math.PI) / 180);
        tctx.drawImage(image, -fw / 2, -fh / 2, fw, fh);
        tctx.restore();
      }
      applyCanvasToMaterial(head.object, "head", tex);
    }
  }, [draft, image, head]);

  React.useEffect(() => { redraw(); }, [redraw]);

  const onLoadCreation = React.useCallback((c: CreationDetail) => {
    setCreationId(c.id);
    setDraft((prev) => ({ ...prev, ...((c.projectState ?? {}) as Partial<FaceDraft>) }));
  }, [setDraft]);

  const buildExport = async (): Promise<ToolExportRequest | null> => {
    if (!photo?.uploadId) {
      toast({ title: "Add a photo", description: "Upload a front-facing headshot first.", variant: "danger" });
      return null;
    }
    return {
      uploadIds: [photo.uploadId],
      config: {
        gender: draft.gender,
        alignment: { x: draft.x, y: draft.y, scale: draft.scale, rotation: draft.rotation },
        skin: { brightness: draft.brightness, contrast: draft.contrast, warmth: draft.warmth, blend: draft.blend },
      },
      name: photo.file.name.replace(/\.[^.]+$/, "") || "Face skin",
    };
  };

  const left = (
    <div className="space-y-4">
      <UploadZone
        accept={[".png", ".jpg", ".jpeg", ".webp"]}
        multiple={false}
        onFiles={(files) => { upload.reset(); upload.add(files); }}
        items={upload.items}
        onCancel={upload.cancel}
        onRetry={upload.retry}
        onRemove={(id) => void upload.remove(id)}
        hint="Front-facing headshot, even lighting, no sunglasses"
      />
      {estimate?.freeDailyRemaining !== null && estimate ? (
        <Alert variant={estimate.freeDailyRemaining ? "success" : "info"}>
          {estimate.freeDailyRemaining ? `${estimate.freeDailyRemaining} free export${estimate.freeDailyRemaining === 1 ? "" : "s"} left today.` : "You have used today's free exports — further exports cost credits."}
        </Alert>
      ) : null}
      <Alert variant="info">Only upload photos of yourself or someone who agreed to it.</Alert>
    </div>
  );

  const right = (
    <>
      <Panel title="Ped">
        <SelectField label="Gender" value={draft.gender} onChange={(v) => setDraft({ gender: v as Gender })} options={[{ value: "male", label: "Male (mp_m_freemode_01)" }, { value: "female", label: "Female (mp_f_freemode_01)" }]} />
      </Panel>
      <Panel title="Alignment">
        <SliderField label="Horizontal" value={draft.x} min={-0.5} max={0.5} step={0.005} onChange={(v) => setDraft({ x: v })} />
        <SliderField label="Vertical" value={draft.y} min={-0.5} max={0.5} step={0.005} onChange={(v) => setDraft({ y: v })} />
        <SliderField label="Scale" value={draft.scale} min={0.3} max={3} step={0.01} onChange={(v) => setDraft({ scale: v })} format={(v) => `${v.toFixed(2)}×`} />
        <SliderField label="Rotation" value={draft.rotation} min={-45} max={45} step={0.5} onChange={(v) => setDraft({ rotation: v })} format={(v) => `${v.toFixed(1)}°`} />
        <Button size="sm" variant="outline" onClick={() => setDraft({ x: 0, y: 0, scale: 1, rotation: 0 })}>Reset alignment</Button>
        <p className="text-[11px] text-fg-subtle">Drag the photo in the canvas to move it. Line the eyes up with the horizontal guide and fill the oval.</p>
      </Panel>
      <Panel title="Skin">
        <SliderField label="Brightness" value={draft.brightness} min={-1} max={1} onChange={(v) => setDraft({ brightness: v })} />
        <SliderField label="Contrast" value={draft.contrast} min={-1} max={1} onChange={(v) => setDraft({ contrast: v })} />
        <SliderField label="Warmth" value={draft.warmth} min={-1} max={1} onChange={(v) => setDraft({ warmth: v })} />
        <SliderField label="Blend into skin" value={draft.blend} min={0} max={1} onChange={(v) => setDraft({ blend: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </Panel>
    </>
  );

  return (
    <ToolFrame
      slug={SLUG}
      left={left}
      leftTitle="Photo"
      right={right}
      buildExport={buildExport}
      exportLabel="Export face skin"
      exportDisabled={!photo?.uploadId}
      exportDisabledReason={!photo?.uploadId ? "Upload a headshot to continue." : undefined}
      projectState={draft}
      creationId={creationId}
      onLoadCreation={onLoadCreation}
      statusSlot={estimate?.freeDailyRemaining ? <Badge variant="success">{estimate.freeDailyRemaining} free today</Badge> : null}
    >
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-lg border border-border bg-bg-elevated p-3">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium"><ScanFace className="h-4 w-4 text-accent" aria-hidden /> Alignment</h2>
          <canvas
            ref={alignRef}
            width={768}
            height={768}
            className="w-full cursor-move touch-none rounded-md border border-border bg-bg-muted"
            role="img"
            aria-label="Face alignment canvas — drag to position the photo"
            onPointerDown={(e) => { (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); dragging.current = { x: e.clientX, y: e.clientY, ox: draft.x, oy: draft.y }; }}
            onPointerMove={(e) => {
              const d = dragging.current;
              if (!d) return;
              const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
              setDraft({ x: d.ox + (e.clientX - d.x) / rect.width, y: d.oy + (e.clientY - d.y) / rect.height });
            }}
            onPointerUp={() => { dragging.current = null; }}
            onPointerCancel={() => { dragging.current = null; }}
          />
          {!image ? <p className="mt-2 text-xs text-fg-muted">Upload a headshot to start aligning.</p> : null}
        </div>
        <Viewport
          object={head?.object ?? null}
          cameraDistanceHint={0.8}
          defaultGrid={false}
          emptyMessage="Head preview"
          className="h-[clamp(300px,50vh,640px)]"
        />
      </div>
    </ToolFrame>
  );
}

export default FaceSkinCreatorEditor;
