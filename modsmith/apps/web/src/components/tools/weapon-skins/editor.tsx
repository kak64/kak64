"use client";
/** Weapon Skins: design camo textures on a weapon UV template and batch-export a skin resource. */
import * as React from "react";
import * as THREE from "three";
import { Copy, Crosshair, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { Viewport } from "@/components/three/viewport";
import { buildWeaponPlaceholder, disposeGroup } from "@/components/three/procedural";
import { applyCanvasToMaterial, canvasToPngBlob, renderUvTemplate } from "@/lib/three/uv";
import { LayerEditor, type Layer, type LayerEditorHandle } from "@/components/canvas/layer-editor";
import { renderLayersOffscreen } from "@/components/canvas/render";
import { ToolFrame, type ToolExportRequest } from "../tool-frame";
import { Panel, Row, TextField } from "../panels";
import { blobToFile, snakeCase, uploadGenerated, useDraftState, type CreationDetail } from "../lib";
import { WEAPONS, WEAPONS_BY_CATEGORY, WEAPON_SHAPES, findWeapon } from "../library/weapons";

const SLUG = "weapon-skins";
const TEMPLATE_SIZE = 1024;

interface Skin { id: string; weapon: string; name: string; enabled: boolean; layers: Layer[] }

interface WeaponDraft extends Record<string, unknown> {
  resourceName: string;
  skins: Skin[];
  activeSkin: string;
}

function newSkin(weapon = "WEAPON_CARBINERIFLE", index = 1): Skin {
  return { id: `skin_${Date.now().toString(36)}_${index}`, weapon, name: `camo${index}`, enabled: true, layers: [] };
}

const FIRST = newSkin();
const INITIAL: WeaponDraft = { resourceName: "modsmith_weaponskins", skins: [FIRST], activeSkin: FIRST.id };

export function WeaponSkinsEditor() {
  const { toast } = useToast();
  const [draft, setDraft] = useDraftState<WeaponDraft>(SLUG, INITIAL);
  const [query, setQuery] = React.useState("");
  const [creationId, setCreationId] = React.useState<string | null>(null);
  const [placeholder, setPlaceholder] = React.useState<THREE.Group | null>(null);
  const [template, setTemplate] = React.useState<HTMLCanvasElement | null>(null);
  const editorApi = React.useRef<LayerEditorHandle | null>(null);

  const active = draft.skins.find((s) => s.id === draft.activeSkin) ?? draft.skins[0]!;
  const weapon = findWeapon(active.weapon) ?? WEAPONS[0]!;

  React.useEffect(() => {
    const group = buildWeaponPlaceholder(WEAPON_SHAPES[weapon.category]);
    setPlaceholder(group);
    setTemplate(renderUvTemplate(group, "weapon_skin", { size: TEMPLATE_SIZE }));
    return () => { disposeGroup(group); };
  }, [weapon.category]);

  const onComposite = React.useCallback((canvas: HTMLCanvasElement) => {
    if (placeholder) applyCanvasToMaterial(placeholder, "weapon_skin", canvas);
  }, [placeholder]);

  const patchActive = (patch: Partial<Skin>) => setDraft((prev) => ({ ...prev, skins: prev.skins.map((s) => (s.id === active.id ? { ...s, ...patch } : s)) }));

  const addSkin = () => {
    if (draft.skins.length >= 50) { toast({ title: "Skin limit reached", description: "A resource supports up to 50 skins." }); return; }
    const s = newSkin(active.weapon, draft.skins.length + 1);
    setDraft((prev) => ({ ...prev, skins: [...prev.skins, s], activeSkin: s.id }));
  };
  const duplicateSkin = () => {
    if (draft.skins.length >= 50) return;
    const s = { ...newSkin(active.weapon, draft.skins.length + 1), layers: JSON.parse(JSON.stringify(active.layers)) as Layer[] };
    setDraft((prev) => ({ ...prev, skins: [...prev.skins, s], activeSkin: s.id }));
  };
  const removeSkin = (id: string) => {
    if (draft.skins.length <= 1) return;
    setDraft((prev) => {
      const skins = prev.skins.filter((s) => s.id !== id);
      return { ...prev, skins, activeSkin: prev.activeSkin === id ? skins[0]!.id : prev.activeSkin };
    });
  };

  const onLoadCreation = React.useCallback((c: CreationDetail) => {
    setCreationId(c.id);
    setDraft((prev) => ({ ...prev, ...((c.projectState ?? {}) as Partial<WeaponDraft>) }));
  }, [setDraft]);

  const exportable = draft.skins.filter((s) => s.enabled && s.layers.length);

  const buildExport = async (): Promise<ToolExportRequest | null> => {
    if (!/^[a-z0-9_]{3,32}$/.test(draft.resourceName)) {
      toast({ title: "Check the resource name", description: "3–32 lowercase letters, numbers or underscores.", variant: "danger" });
      return null;
    }
    if (!exportable.length) {
      toast({ title: "Nothing selected", description: "Enable at least one skin that has artwork.", variant: "danger" });
      return null;
    }
    const skins: { weapon: string; name: string; textureKey: string }[] = [];
    const uploadIds: string[] = [];
    for (const s of exportable) {
      const canvas = s.id === active.id && editorApi.current?.getComposite() ? editorApi.current.getComposite()! : await renderLayersOffscreen(s.layers, TEMPLATE_SIZE);
      const blob = await canvasToPngBlob(canvas, TEMPLATE_SIZE);
      const key = await uploadGenerated(SLUG, blobToFile(blob, `${snakeCase(s.name, "camo")}_${s.weapon.replace(/^WEAPON_/, "").toLowerCase()}.png`, "image/png"));
      uploadIds.push(key);
      skins.push({ weapon: s.weapon, name: s.name.slice(0, 48), textureKey: key });
    }
    return { uploadIds, config: { resourceName: draft.resourceName, skins }, name: draft.resourceName };
  };

  const filtered = query.trim()
    ? WEAPONS.filter((w) => w.label.toLowerCase().includes(query.toLowerCase()) || w.name.toLowerCase().includes(query.toLowerCase()))
    : null;

  const left = (
    <div className="space-y-3">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search weapons…" aria-label="Search weapons" className="h-8 text-xs" />
      <div className="max-h-[26rem] space-y-3 overflow-y-auto scrollbar-thin pr-1">
        {filtered ? (
          <ul className="space-y-1">
            {filtered.map((w) => <WeaponRow key={w.name} label={w.label} txd={w.txd} active={w.name === active.weapon} onPick={() => patchActive({ weapon: w.name })} />)}
            {!filtered.length ? <li className="py-4 text-center text-xs text-fg-subtle">No weapons match “{query}”.</li> : null}
          </ul>
        ) : (
          WEAPONS_BY_CATEGORY.map((group) => (
            <div key={group.category}>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{group.label}</h3>
              <ul className="space-y-1">
                {group.weapons.map((w) => <WeaponRow key={w.name} label={w.label} txd={w.txd} active={w.name === active.weapon} onPick={() => patchActive({ weapon: w.name })} />)}
              </ul>
            </div>
          ))
        )}
      </div>
      <p className="text-[11px] text-fg-subtle">{WEAPONS.length} vanilla weapons. The 3D model is a stand-in — artwork maps to the weapon&apos;s real texture dictionary on export.</p>
    </div>
  );

  const right = (
    <>
      <Panel title="Resource">
        <TextField label="Resource name" mono value={draft.resourceName} onChange={(v) => setDraft({ resourceName: snakeCase(v, "modsmith_weaponskins").slice(0, 32) })} />
        <Row label="Selected weapon">
          <div className="rounded-md border border-border bg-bg-muted px-2 py-1.5 text-xs">
            <p className="font-medium">{weapon.label}</p>
            <p className="font-mono text-[11px] text-fg-subtle">{weapon.name}</p>
            <p className="font-mono text-[11px] text-fg-subtle">txd: {weapon.txd}</p>
          </div>
        </Row>
      </Panel>

      <Panel title={`Skins (${draft.skins.length})`}>
        <ul className="space-y-1.5">
          {draft.skins.map((s) => {
            const w = findWeapon(s.weapon);
            return (
              <li key={s.id} className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 ${s.id === active.id ? "border-accent bg-accent-soft" : "border-border"}`}>
                <Checkbox checked={s.enabled} aria-label={`Include ${s.name} in the export`} onCheckedChange={(v) => setDraft((prev) => ({ ...prev, skins: prev.skins.map((x) => (x.id === s.id ? { ...x, enabled: v === true } : x)) }))} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDraft({ activeSkin: s.id })}>
                  <span className="block truncate text-xs font-medium">{s.name}</span>
                  <span className="block truncate text-[11px] text-fg-subtle">{w?.label ?? s.weapon} · {s.layers.length} layer{s.layers.length === 1 ? "" : "s"}</span>
                </button>
                <Button size="icon-sm" variant="ghost" aria-label={`Delete ${s.name}`} disabled={draft.skins.length <= 1} onClick={() => removeSkin(s.id)}><Trash2 /></Button>
              </li>
            );
          })}
        </ul>
        <TextField label="Design name" value={active.name} maxLength={48} onChange={(v) => patchActive({ name: v })} />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={addSkin}><Plus /> Add</Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={duplicateSkin}><Copy /> Duplicate</Button>
        </div>
        <Alert variant="info">{exportable.length} of {draft.skins.length} skins will be exported (enabled and containing artwork).</Alert>
      </Panel>
    </>
  );

  return (
    <ToolFrame
      slug={SLUG}
      left={left}
      leftTitle="Weapons"
      right={right}
      buildExport={buildExport}
      exportLabel="Export skins"
      exportDisabled={!exportable.length}
      exportDisabledReason={!exportable.length ? "Design at least one skin and keep it enabled." : undefined}
      projectState={{ resourceName: draft.resourceName, skins: draft.skins.map((s) => ({ id: s.id, weapon: s.weapon, name: s.name, enabled: s.enabled })) }}
      creationId={creationId}
      onLoadCreation={onLoadCreation}
      statusSlot={<Badge variant="accent">{exportable.length} ready</Badge>}
      shortcuts={[{ keys: "Ctrl+Z / Ctrl+Shift+Z", label: "Undo / redo" }]}
    >
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <LayerEditor
          key={active.id}
          size={TEMPLATE_SIZE}
          underlay={template}
          layers={active.layers}
          onLayersChange={(layers) => patchActive({ layers })}
          onChange={onComposite}
          apiRef={editorApi}
        />
        <Viewport
          object={placeholder}
          cameraDistanceHint={0.6}
          defaultGrid={false}
          emptyMessage="Pick a weapon to preview it."
          className="h-[clamp(260px,40vh,520px)] xl:h-auto"
        />
      </div>
    </ToolFrame>
  );
}

function WeaponRow({ label, txd, active, onPick }: { label: string; txd: string; active: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={active}
        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${active ? "border-accent bg-accent-soft" : "border-transparent hover:border-border hover:bg-bg-subtle"}`}
      >
        <Crosshair className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{label}</span>
          <span className="block truncate font-mono text-[10px] text-fg-subtle">{txd}</span>
        </span>
      </button>
    </li>
  );
}

export default WeaponSkinsEditor;
