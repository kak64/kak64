"use client";
/** AI Prop Creator: one image in, a textured mesh out — then straight into the Prop Creator editor. */
import * as React from "react";
import { ImagePlus, Sparkles } from "lucide-react";
import { api } from "@/lib/api-client";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { UploadZone } from "@/components/shared/upload-zone";
import { useUpload } from "@/hooks/use-upload";
import { ToolFrame, type ToolExportRequest } from "../tool-frame";
import { Panel, SelectField, TextAreaField } from "../panels";
import { useDraftState, type CreationDetail, type InspectFacts, type JobDetail } from "../lib";
import { PropCreatorEditor, type PropEditorSeed } from "../prop-creator/editor";

const SLUG = "ai-prop-creator";

interface AiDraft extends Record<string, unknown> {
  prompt: string;
  quality: "draft" | "standard" | "high";
}

const INITIAL: AiDraft = { prompt: "", quality: "standard" };

export function AiPropCreatorEditor() {
  const { toast } = useToast();
  const upload = useUpload(SLUG);
  const [draft, setDraft] = useDraftState<AiDraft>(SLUG, INITIAL);
  const [seed, setSeed] = React.useState<PropEditorSeed | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [creationId, setCreationId] = React.useState<string | null>(null);

  const image = upload.completed[0];
  const previewUrl = React.useMemo(() => (image ? URL.createObjectURL(image.file) : null), [image]);
  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const onLoadCreation = React.useCallback((c: CreationDetail) => {
    setCreationId(c.id);
    setDraft((prev) => ({ ...prev, ...((c.projectState ?? {}) as Partial<AiDraft>) }));
    const preview = c.projectState?.preview;
    if (preview?.jobId) setSeed({ uploadId: String(preview.facts?.uploadId ?? ""), jobId: preview.jobId, name: c.name });
  }, [setDraft]);

  const buildExport = async (): Promise<ToolExportRequest | null> => {
    if (!image?.uploadId) {
      toast({ title: "Add a photo", description: "Upload one clear image of the object you want to generate.", variant: "danger" });
      return null;
    }
    setFailed(null);
    return {
      uploadIds: [image.uploadId],
      config: { ...(draft.prompt.trim() ? { prompt: draft.prompt.trim().slice(0, 500) } : {}), quality: draft.quality },
      name: image.file.name.replace(/\.[^.]+$/, "") || "AI prop",
    };
  };

  const onJobComplete = React.useCallback(async (jobId: string, status: string) => {
    if (status !== "COMPLETED") {
      setFailed("Generation did not finish. Your credits were returned — try another photo or a different quality.");
      return;
    }
    try {
      const detail = await api<JobDetail & { resultManifest: { facts?: InspectFacts } | null }>(`/api/v1/jobs/${jobId}`);
      const uploadId = (detail.resultManifest as { facts?: InspectFacts } | null)?.facts?.uploadId;
      if (!uploadId) { setFailed("The generation finished but returned no model file. Contact support with this job id."); return; }
      if (detail.creationId) setCreationId(detail.creationId);
      setSeed({ uploadId, jobId, name: detail.resultName ?? undefined });
      toast({ title: "Your prop is ready", description: "Finish it in the Prop Creator and export when you are happy.", variant: "success" });
    } catch {
      setFailed("Could not read the generated model. Open the job from your jobs list to retry.");
    }
  }, [toast]);

  if (seed) {
    return (
      <PropCreatorEditor
        seed={seed}
        toolSlug={SLUG}
        intro={
          <Alert variant="success" title="Generated prop loaded">
            Edit the transform, collision, LODs and materials exactly like an uploaded model. Exporting the finished resource costs Prop Creator credits.
          </Alert>
        }
      />
    );
  }

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
        hint="One clear photo — a single object, plain background"
      />
      <Alert variant="info">Good input: the whole object in frame, even lighting, no people. Generation replaces only the modelling step — you still control collision, LODs and export.</Alert>
    </div>
  );

  const right = (
    <Panel title="Generation">
      <TextAreaField
        label="Prompt (optional)"
        value={draft.prompt}
        maxLength={500}
        rows={4}
        placeholder="e.g. weathered wooden crate with metal corners"
        hint="Describe materials or details the photo does not show clearly."
        onChange={(v) => setDraft({ prompt: v })}
      />
      <SelectField
        label="Quality"
        value={draft.quality}
        onChange={(v) => setDraft({ quality: v as AiDraft["quality"] })}
        options={[
          { value: "draft", label: "Draft — fastest, low poly" },
          { value: "standard", label: "Standard — balanced" },
          { value: "high", label: "High — most detail, slowest" },
        ]}
        hint="Higher quality takes longer but needs less clean-up."
      />
    </Panel>
  );

  return (
    <ToolFrame
      slug={SLUG}
      left={left}
      leftTitle="Reference photo"
      right={right}
      buildExport={buildExport}
      exportLabel="Generate prop"
      exportDisabled={!image?.uploadId}
      exportDisabledReason={!image?.uploadId ? "Upload a reference photo to generate a prop." : undefined}
      projectState={draft}
      creationId={creationId}
      onLoadCreation={onLoadCreation}
      onJobComplete={onJobComplete}
      notice={failed ? <Alert variant="danger" title="Generation failed">{failed}</Alert> : null}
    >
      <div className="rounded-lg border border-border bg-bg-elevated p-6">
        <div className="mx-auto max-w-lg space-y-4 text-center">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL of the user's own upload
            <img src={previewUrl} alt="Reference photo" className="mx-auto max-h-80 rounded-lg border border-border object-contain" />
          ) : (
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-subtle text-accent"><ImagePlus className="h-6 w-6" aria-hidden /></div>
          )}
          <h2 className="flex items-center justify-center gap-2 text-base font-semibold"><Sparkles className="h-4 w-4 text-accent" aria-hidden /> Generate a prop from a photo</h2>
          <p className="text-sm text-fg-muted">
            When generation finishes, the model opens in the full Prop Creator editor — same transform, collision, LOD, material and export tools as an uploaded mesh.
          </p>
        </div>
      </div>
    </ToolFrame>
  );
}

export default AiPropCreatorEditor;
