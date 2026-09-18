"use client";
/** Chain & Accessory Creator: build chains, pendants and 3D lettering in a live procedural preview. */
import * as React from "react";
import type * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/misc";
import { Viewport } from "@/components/three/viewport";
import { buildChain, disposeGroup, type ChainMaterialKey, type ChainModel } from "@/components/three/procedural";
import { ToolFrame, type ToolExportRequest } from "../tool-frame";
import { Panel, SelectField, SliderField, TextField, Vec3Field } from "../panels";
import { snakeCase, useDraftState, type CreationDetail } from "../lib";

const SLUG = "chain-creator";

const MODELS: { value: ChainModel; label: string }[] = [
  { value: "cuban-chain", label: "Cuban link chain" },
  { value: "rope-chain", label: "Rope chain" },
  { value: "tennis-chain", label: "Tennis chain" },
  { value: "pendant-round", label: "Round pendant" },
  { value: "pendant-plate", label: "Name plate pendant" },
  { value: "lettering", label: "3D lettering" },
];

const MATERIALS: { value: ChainMaterialKey; label: string }[] = [
  { value: "gold", label: "Gold" }, { value: "silver", label: "Silver" }, { value: "rose-gold", label: "Rose gold" }, { value: "black", label: "Matte black" },
];

interface ChainDraft extends Record<string, unknown> {
  resourceName: string;
  baseModel: ChainModel;
  text: string;
  material: ChainMaterialKey;
  scale: number;
  position: [number, number, number];
  gender: "male" | "female" | "both";
}

const INITIAL: ChainDraft = {
  resourceName: "modsmith_chain", baseModel: "cuban-chain", text: "", material: "gold", scale: 1, position: [0, 0, 0], gender: "both",
};

export function ChainCreatorEditor() {
  const [draft, setDraft] = useDraftState<ChainDraft>(SLUG, INITIAL);
  const [creationId, setCreationId] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<THREE.Group | null>(null);

  React.useEffect(() => {
    const group = buildChain({
      baseModel: draft.baseModel,
      material: draft.material,
      text: draft.text,
      scale: draft.scale,
      position: draft.position,
    });
    setPreview(group);
    return () => disposeGroup(group);
  }, [draft.baseModel, draft.material, draft.text, draft.scale, draft.position]);

  const onLoadCreation = React.useCallback((c: CreationDetail) => {
    setCreationId(c.id);
    setDraft((prev) => ({ ...prev, ...((c.projectState ?? {}) as Partial<ChainDraft>) }));
  }, [setDraft]);

  const needsText = draft.baseModel === "lettering" || draft.baseModel === "pendant-plate";
  const textError = needsText && !draft.text.trim() ? "Add up to 12 characters of text for this model." : undefined;
  const nameError = /^[a-z0-9_]{3,32}$/.test(draft.resourceName) ? undefined : "3–32 lowercase letters, numbers or underscores.";

  const buildExport = async (): Promise<ToolExportRequest | null> => {
    if (nameError || textError) return null;
    return {
      uploadIds: [],
      config: {
        resourceName: draft.resourceName,
        baseModel: draft.baseModel,
        ...(draft.text.trim() ? { text: draft.text.trim().slice(0, 12) } : {}),
        material: draft.material,
        scale: draft.scale,
        position: draft.position,
        gender: draft.gender,
      },
      name: draft.resourceName,
    };
  };

  const left = (
    <div className="space-y-4">
      <SelectField label="Base model" value={draft.baseModel} onChange={(v) => setDraft({ baseModel: v as ChainModel })} options={MODELS} />
      <SelectField label="Material" value={draft.material} onChange={(v) => setDraft({ material: v as ChainMaterialKey })} options={MATERIALS} />
      <div className="grid grid-cols-2 gap-2">
        {MATERIALS.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={draft.material === m.value}
            onClick={() => setDraft({ material: m.value })}
            className={`rounded-md border px-2 py-2 text-xs ${draft.material === m.value ? "border-accent bg-accent-soft" : "border-border hover:bg-bg-subtle"}`}
          >
            <span
              className="mx-auto mb-1 block h-5 w-5 rounded-full"
              style={{ background: { gold: "#e5b53c", silver: "#d7dbe2", "rose-gold": "#e0a08a", black: "#1e222b" }[m.value] }}
              aria-hidden
            />
            {m.label}
          </button>
        ))}
      </div>
      <Alert variant="info">Everything here is generated on our servers — no files to upload. The preview is the same geometry the exporter builds.</Alert>
    </div>
  );

  const right = (
    <>
      <Panel title="Accessory">
        <TextField label="Resource name" mono value={draft.resourceName} error={nameError} onChange={(v) => setDraft({ resourceName: snakeCase(v, "modsmith_chain").slice(0, 32) })} />
        <TextField
          label="Text"
          value={draft.text}
          maxLength={12}
          error={textError}
          hint={needsText ? "Up to 12 characters." : "Optional — adds lettering to the pendant."}
          onChange={(v) => setDraft({ text: v.slice(0, 12) })}
        />
        <SelectField label="Gender" value={draft.gender} onChange={(v) => setDraft({ gender: v as ChainDraft["gender"] })} options={[{ value: "both", label: "Both" }, { value: "male", label: "Male only" }, { value: "female", label: "Female only" }]} />
      </Panel>
      <Panel title="Fit">
        <SliderField label="Scale" value={draft.scale} min={0.5} max={2} step={0.01} onChange={(v) => setDraft({ scale: v })} format={(v) => `${v.toFixed(2)}×`} />
        <Vec3Field label="Position offset (m)" step={0.005} value={draft.position} onChange={(v) => setDraft({ position: v })} />
        <Button size="sm" variant="outline" onClick={() => setDraft({ scale: 1, position: [0, 0, 0] })}>Reset fit</Button>
        <p className="text-[11px] text-fg-subtle">The ped reference is 1.83 m tall — use it to judge how the chain sits on the chest.</p>
      </Panel>
    </>
  );

  return (
    <ToolFrame
      slug={SLUG}
      left={left}
      leftTitle="Design"
      right={right}
      buildExport={buildExport}
      exportLabel="Export accessory"
      exportDisabled={!!nameError || !!textError}
      exportDisabledReason={nameError ?? textError}
      projectState={draft}
      creationId={creationId}
      onLoadCreation={onLoadCreation}
      statusSlot={<Badge variant="outline">{MODELS.find((m) => m.value === draft.baseModel)?.label}</Badge>}
    >
      <Viewport
        object={preview}
        defaultPed
        cameraDistanceHint={0.45}
        emptyMessage="Building the preview…"
        className="h-[clamp(360px,62vh,820px)]"
      />
    </ToolFrame>
  );
}

export default ChainCreatorEditor;
