"use client";
/** Tattoo Creator: place artwork on a procedural ped's body zones and export a framework-ready pack. */
import * as React from "react";
import { ArrowDown, ArrowUp, Trash2, Feather } from "lucide-react";
import { FIVEM_FRAMEWORKS } from "@modsmith/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { UploadZone } from "@/components/shared/upload-zone";
import { useUpload } from "@/hooks/use-upload";
import { Viewport } from "@/components/three/viewport";
import { buildPedBody, PED_ZONES, PED_ZONE_LABELS, type Gender, type PedZone, type ProceduralBody } from "@/components/three/procedural";
import { applyCanvasToMaterial, createCanvas } from "@/lib/three/uv";
import { ToolFrame, type ToolExportRequest } from "../tool-frame";
import { Panel, Row, SelectField, SliderField, TextField } from "../panels";
import { snakeCase, useDraftState, type CreationDetail } from "../lib";

const SLUG = "tattoo-creator";
const ZONE_CANVAS = 1024;
const SKIN = "#c8a48a";

interface Tattoo {
  id: string;
  name: string;
  imageKey: string;
  /** Local preview only — never sent to the API. */
  previewUrl?: string;
  zone: PedZone;
  gender: "male" | "female" | "both";
  position: [number, number];
  rotation: number;
  scale: number;
  opacity: number;
  order: number;
}

interface TattooDraft extends Record<string, unknown> {
  packName: string;
  frameworks: string[];
  tattoos: Tattoo[];
  activeId: string | null;
  previewGender: Gender;
}

const INITIAL: TattooDraft = { packName: "modsmith_tattoos", frameworks: ["standalone"], tattoos: [], activeId: null, previewGender: "male" };

export function TattooCreatorEditor() {
  const { toast } = useToast();
  const upload = useUpload(SLUG);
  const [draft, setDraft] = useDraftState<TattooDraft>(SLUG, INITIAL);
  const [creationId, setCreationId] = React.useState<string | null>(null);
  const [body, setBody] = React.useState<ProceduralBody | null>(null);
  const [selectedZone, setSelectedZone] = React.useState<PedZone>("torso");
  const canvases = React.useRef<Map<PedZone, HTMLCanvasElement>>(new Map());
  const images = React.useRef<Map<string, HTMLImageElement>>(new Map());
  const [imageTick, setImageTick] = React.useState(0);

  React.useEffect(() => {
    const built = buildPedBody(draft.previewGender);
    setBody(built);
    return () => built.dispose();
  }, [draft.previewGender]);

  // Paint each zone's canvas whenever the tattoos change.
  React.useEffect(() => {
    if (!body) return;
    for (const zone of PED_ZONES) {
      let canvas = canvases.current.get(zone);
      if (!canvas) { canvas = createCanvas(ZONE_CANVAS); canvases.current.set(zone, canvas); }
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = SKIN;
      ctx.fillRect(0, 0, ZONE_CANVAS, ZONE_CANVAS);
      const list = draft.tattoos
        .filter((t) => t.zone === zone && (t.gender === "both" || t.gender === draft.previewGender))
        .sort((a, b) => a.order - b.order);
      for (const t of list) {
        const img = t.previewUrl ? images.current.get(t.previewUrl) : undefined;
        if (!img) continue;
        const base = ZONE_CANVAS * 0.45 * t.scale;
        const ratio = img.width / img.height || 1;
        const w = ratio >= 1 ? base : base * ratio;
        const h = ratio >= 1 ? base / ratio : base;
        ctx.save();
        ctx.globalAlpha = t.opacity;
        ctx.translate(t.position[0] * ZONE_CANVAS, t.position[1] * ZONE_CANVAS);
        ctx.rotate((t.rotation * Math.PI) / 180);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      applyCanvasToMaterial(body.object, zone, canvas);
    }
  }, [body, draft.tattoos, draft.previewGender, imageTick]);

  // Turn finished uploads into tattoo entries (with a local preview image).
  const handled = React.useRef(new Set<string>());
  React.useEffect(() => {
    const fresh = upload.completed.filter((i) => i.uploadId && !handled.current.has(i.uploadId));
    if (!fresh.length) return;
    const additions: Tattoo[] = [];
    for (const item of fresh) {
      handled.current.add(item.uploadId!);
      const url = URL.createObjectURL(item.file);
      const img = new Image();
      img.onload = () => { images.current.set(url, img); setImageTick((n) => n + 1); };
      img.src = url;
      additions.push({
        id: `tat_${item.uploadId}`,
        name: item.file.name.replace(/\.[^.]+$/, "").slice(0, 48) || "Tattoo",
        imageKey: item.uploadId!,
        previewUrl: url,
        zone: selectedZone,
        gender: "both",
        position: [0.5, 0.5],
        rotation: 0,
        scale: 1,
        opacity: 1,
        order: 0,
      });
    }
    setDraft((prev) => ({
      ...prev,
      tattoos: [...prev.tattoos, ...additions.map((t, i) => ({ ...t, order: prev.tattoos.length + i }))],
      activeId: additions[additions.length - 1]?.id ?? prev.activeId,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- new uploads land on the zone selected at drop time
  }, [upload.completed]);

  const active = draft.tattoos.find((t) => t.id === draft.activeId) ?? null;
  const patchActive = (patch: Partial<Tattoo>) => {
    if (!active) return;
    setDraft((prev) => ({ ...prev, tattoos: prev.tattoos.map((t) => (t.id === active.id ? { ...t, ...patch } : t)) }));
  };
  const reorder = (id: string, dir: -1 | 1) => {
    setDraft((prev) => {
      const sorted = [...prev.tattoos].sort((a, b) => a.order - b.order);
      const i = sorted.findIndex((t) => t.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= sorted.length) return prev;
      const [item] = sorted.splice(i, 1);
      sorted.splice(j, 0, item!);
      return { ...prev, tattoos: sorted.map((t, idx) => ({ ...t, order: idx })) };
    });
  };
  const remove = (id: string) => setDraft((prev) => ({ ...prev, tattoos: prev.tattoos.filter((t) => t.id !== id), activeId: prev.activeId === id ? null : prev.activeId }));

  const onLoadCreation = React.useCallback((c: CreationDetail) => {
    setCreationId(c.id);
    setDraft((prev) => ({ ...prev, ...((c.projectState ?? {}) as Partial<TattooDraft>) }));
  }, [setDraft]);

  const buildExport = async (): Promise<ToolExportRequest | null> => {
    if (!/^[a-z0-9_]{3,32}$/.test(draft.packName)) {
      toast({ title: "Check the pack name", description: "3–32 lowercase letters, numbers or underscores.", variant: "danger" });
      return null;
    }
    if (!draft.tattoos.length) {
      toast({ title: "No tattoos yet", description: "Upload at least one tattoo image.", variant: "danger" });
      return null;
    }
    if (!draft.frameworks.length) {
      toast({ title: "Pick a framework", description: "Choose at least one framework to generate config for.", variant: "danger" });
      return null;
    }
    return {
      uploadIds: draft.tattoos.map((t) => t.imageKey),
      config: {
        packName: draft.packName,
        frameworks: draft.frameworks,
        tattoos: draft.tattoos
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((t) => ({
            id: t.id,
            name: t.name,
            imageKey: t.imageKey,
            zone: t.zone,
            gender: t.gender,
            position: t.position,
            rotation: t.rotation,
            scale: t.scale,
            opacity: t.opacity,
            order: t.order,
          })),
      },
      name: draft.packName,
    };
  };

  const left = (
    <div className="space-y-4">
      <SelectField label="Drop onto zone" value={selectedZone} onChange={(v) => setSelectedZone(v as PedZone)} options={PED_ZONES.map((z) => ({ value: z, label: PED_ZONE_LABELS[z] }))} hint="Or click a body part in the 3D view." />
      <UploadZone
        accept={[".png", ".jpg", ".jpeg", ".webp"]}
        onFiles={(files) => upload.add(files)}
        items={upload.items}
        onCancel={upload.cancel}
        onRetry={upload.retry}
        onRemove={(id) => void upload.remove(id)}
        hint="Transparent PNGs work best"
      />
      <Alert variant="info">The ped is a stylised stand-in. Placement is stored per zone, so the exported pack lands in the right spot on the real ped.</Alert>
    </div>
  );

  const right = (
    <>
      <Panel title="Pack">
        <TextField label="Pack name" mono value={draft.packName} onChange={(v) => setDraft({ packName: snakeCase(v, "modsmith_tattoos").slice(0, 32) })} />
        <Row label="Frameworks" hint="Config files are generated for every framework you tick.">
          <div className="space-y-1.5">
            {FIVEM_FRAMEWORKS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={draft.frameworks.includes(f)}
                  aria-label={f}
                  onCheckedChange={(v) => setDraft((prev) => ({ ...prev, frameworks: v === true ? [...prev.frameworks, f] : prev.frameworks.filter((x) => x !== f) }))}
                />
                {f}
              </label>
            ))}
          </div>
        </Row>
        <SelectField label="Preview gender" value={draft.previewGender} onChange={(v) => setDraft({ previewGender: v as Gender })} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} />
      </Panel>

      <Panel title={`Tattoos (${draft.tattoos.length})`}>
        {draft.tattoos.length ? (
          <ul className="space-y-1.5">
            {draft.tattoos.slice().sort((a, b) => a.order - b.order).map((t) => (
              <li key={t.id} className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 ${t.id === draft.activeId ? "border-accent bg-accent-soft" : "border-border"}`}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setDraft({ activeId: t.id }); setSelectedZone(t.zone); }}>
                  <span className="block truncate text-xs font-medium">{t.name}</span>
                  <span className="block truncate text-[11px] text-fg-subtle">{PED_ZONE_LABELS[t.zone]} · {t.gender}</span>
                </button>
                <Button size="icon-sm" variant="ghost" aria-label={`Move ${t.name} up`} onClick={() => reorder(t.id, -1)}><ArrowUp /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Move ${t.name} down`} onClick={() => reorder(t.id, 1)}><ArrowDown /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Delete ${t.name}`} onClick={() => remove(t.id)}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-fg-subtle">Upload an image to add your first tattoo.</p>}
      </Panel>

      {active ? (
        <Panel title="Placement">
          <TextField label="Name" value={active.name} maxLength={48} onChange={(v) => patchActive({ name: v })} />
          <SelectField label="Zone" value={active.zone} onChange={(v) => patchActive({ zone: v as PedZone })} options={PED_ZONES.map((z) => ({ value: z, label: PED_ZONE_LABELS[z] }))} />
          <SelectField label="Gender" value={active.gender} onChange={(v) => patchActive({ gender: v as Tattoo["gender"] })} options={[{ value: "both", label: "Both" }, { value: "male", label: "Male only" }, { value: "female", label: "Female only" }]} />
          <SliderField label="Position X" value={active.position[0]} min={0} max={1} step={0.005} onChange={(v) => patchActive({ position: [v, active.position[1]] })} format={(v) => `${Math.round(v * 100)}%`} />
          <SliderField label="Position Y" value={active.position[1]} min={0} max={1} step={0.005} onChange={(v) => patchActive({ position: [active.position[0], v] })} format={(v) => `${Math.round(v * 100)}%`} />
          <SliderField label="Rotation" value={active.rotation} min={-180} max={180} step={1} onChange={(v) => patchActive({ rotation: v })} format={(v) => `${Math.round(v)}°`} />
          <SliderField label="Scale" value={active.scale} min={0.05} max={5} step={0.01} onChange={(v) => patchActive({ scale: v })} format={(v) => `${v.toFixed(2)}×`} />
          <SliderField label="Opacity" value={active.opacity} min={0} max={1} step={0.01} onChange={(v) => patchActive({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </Panel>
      ) : null}
    </>
  );

  return (
    <ToolFrame
      slug={SLUG}
      left={left}
      leftTitle="Artwork"
      right={right}
      buildExport={buildExport}
      exportLabel="Export tattoo pack"
      exportDisabled={!draft.tattoos.length}
      exportDisabledReason={!draft.tattoos.length ? "Upload at least one tattoo image." : undefined}
      projectState={{ packName: draft.packName, frameworks: draft.frameworks, tattoos: draft.tattoos.map(({ previewUrl: _p, ...t }) => t) }}
      creationId={creationId}
      onLoadCreation={onLoadCreation}
      statusSlot={draft.tattoos.length ? <Badge variant="accent">{draft.tattoos.length} tattoo{draft.tattoos.length === 1 ? "" : "s"}</Badge> : null}
      shortcuts={[{ keys: "Click", label: "Select the body zone under the cursor" }]}
    >
      <Viewport
        object={body?.object ?? null}
        onSelect={(mesh) => { if ((PED_ZONES as readonly string[]).includes(mesh)) setSelectedZone(mesh as PedZone); }}
        selectedMesh={selectedZone}
        cameraDistanceHint={1.1}
        emptyMessage="Building the ped preview…"
        className="h-[clamp(360px,62vh,820px)]"
      />
      <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted"><Feather className="h-3.5 w-3.5" aria-hidden /> Click a body part to target it, then upload artwork — placement updates on the model instantly.</p>
    </ToolFrame>
  );
}

export default TattooCreatorEditor;
