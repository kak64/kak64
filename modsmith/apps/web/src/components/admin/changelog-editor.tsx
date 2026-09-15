"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Section } from "./section";
import { EditorBar, MarkdownField } from "./editor-parts";
import { DeleteButton } from "./delete-button";
import { useAdminAction } from "./use-admin-action";

export type ChangelogFormValue = {
  id?: string;
  version: string;
  title: string;
  category: "feature" | "improvement" | "fix" | "tool";
  description: string;
  screenshotKeys: string[];
  toolSlug: string;
  state: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  /** ISO string or "" */
  publishedAt: string;
};

/** datetime-local <-> ISO helpers (local time in, UTC out). */
function toLocalInput(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ChangelogEditor({ initial, tools }: { initial: ChangelogFormValue; tools: { slug: string; name: string }[] }) {
  const router = useRouter();
  const { run, isBusy } = useAdminAction();
  const [form, setForm] = React.useState<ChangelogFormValue>(initial);
  const [publishedLocal, setPublishedLocal] = React.useState(toLocalInput(initial.publishedAt));
  const [shots, setShots] = React.useState(initial.screenshotKeys.join(", "));
  const editing = !!initial.id;
  const set = <K extends keyof ChangelogFormValue>(k: K, v: ChangelogFormValue[K]) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.version.trim() && form.title.trim() && form.description.trim();

  const save = async () => {
    const published = publishedLocal ? new Date(publishedLocal) : null;
    const body = {
      version: form.version.trim(),
      title: form.title.trim(),
      category: form.category,
      description: form.description,
      screenshotKeys: shots.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      toolSlug: form.toolSlug || null,
      state: form.state,
      publishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
    };
    const res = await run("save", () => editing
      ? api<{ id: string }>(`/api/v1/admin/changelog/${initial.id}`, { method: "PATCH", json: body })
      : api<{ id: string }>("/api/v1/admin/changelog", { json: body }), { success: editing ? "Entry saved" : "Entry created", refresh: editing });
    if (res && !editing) router.push(`/admin/changelog/${res.id}`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section title="Entry" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Version" htmlFor="cl-version" hint="e.g. 1.4.0"><Input id="cl-version" maxLength={24} value={form.version} onChange={(e) => set("version", e.target.value)} /></Field>
            <Field label="Category" htmlFor="cl-category">
              <NativeSelect id="cl-category" value={form.category} onChange={(e) => set("category", e.target.value as ChangelogFormValue["category"])}>
                <option value="feature">Feature</option>
                <option value="improvement">Improvement</option>
                <option value="fix">Fix</option>
                <option value="tool">Tool</option>
              </NativeSelect>
            </Field>
            <Field label="Title" htmlFor="cl-title" className="sm:col-span-2"><Input id="cl-title" maxLength={140} value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Screenshot keys" htmlFor="cl-shots" className="sm:col-span-2" hint="Storage object keys, comma separated.">
              <Input id="cl-shots" value={shots} onChange={(e) => setShots(e.target.value)} placeholder="changelog/1-4-0-a.webp, changelog/1-4-0-b.webp" />
            </Field>
          </div>
        </Section>

        <Section title="Publishing">
          <div className="space-y-3">
            <Field label="State" htmlFor="cl-state">
              <NativeSelect id="cl-state" value={form.state} onChange={(e) => set("state", e.target.value as ChangelogFormValue["state"])}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </NativeSelect>
            </Field>
            <Field label="Published at" htmlFor="cl-published" hint="Leave blank to stamp the current time on publish.">
              <Input id="cl-published" type="datetime-local" value={publishedLocal} onChange={(e) => setPublishedLocal(e.target.value)} />
            </Field>
            <Field label="Related tool" htmlFor="cl-tool">
              <NativeSelect id="cl-tool" value={form.toolSlug} onChange={(e) => set("toolSlug", e.target.value)}>
                <option value="">None</option>
                {tools.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </NativeSelect>
            </Field>
          </div>
        </Section>
      </div>

      <Section title="Description" description="Markdown with a live preview.">
        <MarkdownField label="Body" id="cl-description" value={form.description} onChange={(v) => set("description", v)} rows={16} />
      </Section>

      <EditorBar>
        {editing ? (
          <DeleteButton endpoint={`/api/v1/admin/changelog/${initial.id}`} title="Delete this changelog entry?" description="The entry is permanently removed."
            label="Delete" size="default" variant="outline" success="Entry deleted" redirectTo="/admin/changelog" />
        ) : null}
        <Button variant="outline" onClick={() => router.push("/admin/changelog")}>Cancel</Button>
        <Button loading={isBusy("save")} disabled={!valid} onClick={() => void save()}><Save />{editing ? "Save entry" : "Create entry"}</Button>
      </EditorBar>
    </div>
  );
}
