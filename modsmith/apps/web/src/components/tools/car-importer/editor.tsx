"use client";
/** Add-on Car Importer: a GTA5-Mods link or an archive in, a streamable add-on vehicle resource out. */
import * as React from "react";
import { Car, Link2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { UploadZone } from "@/components/shared/upload-zone";
import { useUpload } from "@/hooks/use-upload";
import { ToolFrame, type ToolExportRequest } from "../tool-frame";
import { Panel, TextField, ToggleRow } from "../panels";
import { useDraftState, type CreationDetail, type InspectFacts, type JobDetail } from "../lib";

const SLUG = "car-importer";
const HOST = /^(www\.)?gta5-mods\.com$/i;

interface CarDraft extends Record<string, unknown> {
  source: "url" | "archive";
  sourceUrl: string;
  convertReplaceToAddon: boolean;
  newSpawnName: string;
  keepAudio: boolean;
}

const INITIAL: CarDraft = { source: "url", sourceUrl: "", convertReplaceToAddon: true, newSpawnName: "", keepAudio: true };

/** Stable short id for the external reference (the API only needs a provider-scoped identifier). */
function urlHash(url: string) {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  return `g5m_${h.toString(16)}`;
}

function validUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && HOST.test(u.hostname);
  } catch { return false; }
}

export function CarImporterEditor() {
  const { toast } = useToast();
  const upload = useUpload(SLUG);
  const [draft, setDraft] = useDraftState<CarDraft>(SLUG, INITIAL);
  const [creationId, setCreationId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ jobId: string; facts: InspectFacts } | null>(null);

  const urlOk = draft.source !== "url" || validUrl(draft.sourceUrl.trim());
  const spawnError = draft.newSpawnName && !/^[a-z0-9_]{2,24}$/.test(draft.newSpawnName) ? "2–24 lowercase letters, numbers or underscores." : undefined;
  const ready = draft.source === "url" ? urlOk && !!draft.sourceUrl.trim() : upload.uploadIds.length > 0;

  const onLoadCreation = React.useCallback((c: CreationDetail) => {
    setCreationId(c.id);
    setDraft((prev) => ({ ...prev, ...((c.projectState ?? {}) as Partial<CarDraft>) }));
  }, [setDraft]);

  const makeRequest = (convert: boolean): ToolExportRequest => {
    const url = draft.sourceUrl.trim();
    return {
      uploadIds: draft.source === "archive" ? upload.uploadIds : [],
      config: {
        ...(draft.source === "url" ? { sourceUrl: url } : {}),
        convertReplaceToAddon: convert,
        ...(draft.newSpawnName ? { newSpawnName: draft.newSpawnName } : {}),
        keepAudio: draft.keepAudio,
        rightsConfirmed: true,
      },
      ...(draft.source === "url" ? { externalRef: { provider: "gta5mods", id: urlHash(url), url } } : {}),
      name: draft.newSpawnName || (draft.source === "archive" ? upload.completed[0]?.file.name.replace(/\.[^.]+$/, "") : url.split("/").filter(Boolean).pop()) || "Imported vehicle",
    };
  };

  const buildExport = async (): Promise<ToolExportRequest | null> => {
    if (draft.source === "url" && !validUrl(draft.sourceUrl.trim())) {
      toast({ title: "Check the link", description: "Paste an https:// link to a gta5-mods.com vehicle page.", variant: "danger" });
      return null;
    }
    if (draft.source === "archive" && !upload.uploadIds.length) {
      toast({ title: "Upload an archive", description: "Add the mod archive (.zip, .rar, .7z or .oiv).", variant: "danger" });
      return null;
    }
    setResult(null);
    return makeRequest(draft.convertReplaceToAddon);
  };

  const onJobComplete = React.useCallback(async (jobId: string, status: string) => {
    if (status !== "COMPLETED") return;
    try {
      const detail = await api<JobDetail & { resultManifest: { facts?: InspectFacts } | null }>(`/api/v1/jobs/${jobId}`);
      const facts = (detail.resultManifest as { facts?: InspectFacts } | null)?.facts ?? {};
      if (detail.creationId) setCreationId(detail.creationId);
      setResult({ jobId, facts });
    } catch { /* the notice is a nicety; the download works regardless */ }
  }, []);

  const rerunWithConversion = async () => {
    try {
      const req = makeRequest(true);
      const job = await api<{ id: string; creationId: string | null }>("/api/v1/jobs", {
        json: { toolSlug: SLUG, uploadIds: req.uploadIds, config: req.config, name: req.name, ...(req.externalRef ? { externalRef: req.externalRef } : {}), rightsConfirmed: true, purpose: "export" },
      });
      setDraft({ convertReplaceToAddon: true });
      setResult(null);
      toast({ title: "Re-running with add-on conversion", description: "Track it in your jobs list.", variant: "success" });
      if (job.creationId) setCreationId(job.creationId);
    } catch (err) {
      toast({ title: "Could not start the re-run", description: (err as Error).message, variant: "danger" });
    }
  };

  const notice = result?.facts.replaceDetected ? (
    <Alert variant={draft.convertReplaceToAddon ? "success" : "warning"} title="Replace mod detected">
      {draft.convertReplaceToAddon ? (
        <p>This appears to replace <strong>{String(result.facts.originalModel ?? "a base-game vehicle")}</strong>. Converted to standalone add-on <strong>{String(result.facts.spawnName ?? draft.newSpawnName ?? "addon vehicle")}</strong>.</p>
      ) : (
        <>
          <p>This appears to replace <strong>{String(result.facts.originalModel ?? "a base-game vehicle")}</strong>, so it will overwrite that vehicle on your server.</p>
          <Button size="sm" className="mt-2" onClick={rerunWithConversion}><RefreshCw /> Re-run as a standalone add-on</Button>
        </>
      )}
    </Alert>
  ) : null;

  const left = (
    <div className="space-y-4">
      <Tabs value={draft.source} onValueChange={(v) => setDraft({ source: v as CarDraft["source"] })}>
        <TabsList className="w-full">
          <TabsTrigger value="url" className="flex-1">Link</TabsTrigger>
          <TabsTrigger value="archive" className="flex-1">Archive</TabsTrigger>
        </TabsList>
      </Tabs>
      {draft.source === "url" ? (
        <div className="space-y-1.5">
          <Label htmlFor="ms-car-url">GTA5-Mods link</Label>
          <Input
            id="ms-car-url"
            value={draft.sourceUrl}
            invalid={!!draft.sourceUrl && !urlOk}
            placeholder="https://www.gta5-mods.com/vehicles/…"
            onChange={(e) => setDraft({ sourceUrl: e.target.value })}
          />
          {draft.sourceUrl && !urlOk ? <p className="text-xs text-danger" role="alert">Only https links to gta5-mods.com are accepted.</p> : <p className="text-xs text-fg-subtle">We fetch the archive on our servers — nothing downloads through your browser.</p>}
        </div>
      ) : (
        <UploadZone
          accept={[".zip", ".rar", ".7z", ".oiv"]}
          multiple={false}
          onFiles={(files) => upload.add(files)}
          items={upload.items}
          onCancel={upload.cancel}
          onRetry={upload.retry}
          onRemove={(id) => void upload.remove(id)}
          hint="The mod archive exactly as you downloaded it"
        />
      )}
      <Alert variant="info">Only import vehicles you are allowed to use on your server. You confirm this before the build starts.</Alert>
    </div>
  );

  const right = (
    <Panel title="Import options">
      <ToggleRow
        label="Convert replace mods to add-on"
        hint="Replace mods overwrite a base-game car. Conversion gives the vehicle its own spawn name instead."
        checked={draft.convertReplaceToAddon}
        onChange={(v) => setDraft({ convertReplaceToAddon: v })}
      />
      <TextField
        label="New spawn name"
        mono
        value={draft.newSpawnName}
        error={spawnError}
        placeholder="auto"
        hint="Optional — leave blank to derive it from the mod name."
        onChange={(v) => setDraft({ newSpawnName: v.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) })}
      />
      <ToggleRow label="Keep engine audio" hint="Preserves custom audio banks and game references." checked={draft.keepAudio} onChange={(v) => setDraft({ keepAudio: v })} />
    </Panel>
  );

  return (
    <ToolFrame
      slug={SLUG}
      left={left}
      leftTitle="Source"
      right={right}
      rightTitle="Options"
      buildExport={buildExport}
      exportLabel="Import vehicle"
      exportDisabled={!ready || !!spawnError}
      exportDisabledReason={!ready ? "Paste a gta5-mods link or upload the mod archive." : spawnError}
      projectState={draft}
      creationId={creationId}
      onLoadCreation={onLoadCreation}
      onJobComplete={onJobComplete}
      notice={notice}
    >
      <div className="rounded-lg border border-border bg-bg-elevated p-6">
        <div className="mx-auto max-w-xl space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-subtle text-accent">
            {draft.source === "url" ? <Link2 className="h-6 w-6" aria-hidden /> : <Car className="h-6 w-6" aria-hidden />}
          </div>
          <h2 className="text-base font-semibold">Ready-to-stream add-on vehicles</h2>
          <p className="text-sm text-fg-muted">
            We fetch or unpack the mod, detect its DLC structure, rewrite <code className="font-mono text-xs">vehicles.meta</code>, <code className="font-mono text-xs">handling.meta</code>, carcols and carvariations,
            keep the engine audio, and package a resource you can drop straight into your server.
          </p>
          <ul className="mx-auto grid max-w-md gap-2 text-left text-sm text-fg-muted">
            <li className="rounded-md border border-border bg-bg-muted px-3 py-2">Replace mods are detected and converted to standalone add-ons.</li>
            <li className="rounded-md border border-border bg-bg-muted px-3 py-2">Audio banks, tuning parts and liveries are carried across.</li>
            <li className="rounded-md border border-border bg-bg-muted px-3 py-2">You get a complete ZIP with an fxmanifest and a spawn name.</li>
          </ul>
          {result && !result.facts.replaceDetected ? <Alert variant="success">Import finished — the vehicle was already a standalone add-on.</Alert> : null}
        </div>
      </div>
    </ToolFrame>
  );
}

export default CarImporterEditor;
