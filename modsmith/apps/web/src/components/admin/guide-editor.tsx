"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { api } from "@/lib/api-client";
import { slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Section } from "./section";
import { CountedField, EditorBar, FaqRepeater, MarkdownField, type Faq } from "./editor-parts";
import { DeleteButton } from "./delete-button";
import { useAdminAction } from "./use-admin-action";

export type GuideFormValue = {
  id?: string;
  slug: string;
  categoryId: string;
  title: string;
  intro: string;
  content: string;
  coverKey: string;
  seoTitle: string;
  seoDescription: string;
  faqs: Faq[];
  relatedSlugs: string[];
  toolSlug: string;
  state: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

export function GuideEditor({ initial, categories, tools }: { initial: GuideFormValue; categories: { id: string; name: string }[]; tools: { slug: string; name: string }[] }) {
  const router = useRouter();
  const { run, isBusy } = useAdminAction();
  const [form, setForm] = React.useState<GuideFormValue>(initial);
  const [related, setRelated] = React.useState(initial.relatedSlugs.join(", "));
  const editing = !!initial.id;
  const set = <K extends keyof GuideFormValue>(k: K, v: GuideFormValue[K]) => setForm((f) => ({ ...f, [k]: v }));

  const valid = form.slug.trim() && form.categoryId && form.title.trim() && form.intro.trim() && form.content.trim();

  const save = async () => {
    const body = {
      slug: form.slug.trim(),
      categoryId: form.categoryId,
      title: form.title.trim(),
      intro: form.intro.trim(),
      content: form.content,
      coverKey: form.coverKey.trim() || null,
      seoTitle: form.seoTitle.trim() || null,
      seoDescription: form.seoDescription.trim() || null,
      faqs: form.faqs.filter((f) => f.question.trim() && f.answer.trim()),
      relatedSlugs: related.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      toolSlug: form.toolSlug || null,
      state: form.state,
    };
    const res = await run("save", () => editing
      ? api<{ id: string }>(`/api/v1/admin/guides/${initial.id}`, { method: "PATCH", json: body })
      : api<{ id: string }>("/api/v1/admin/guides", { json: body }), { success: editing ? "Guide saved" : "Guide created", refresh: editing });
    if (res && !editing) router.push(`/admin/guides/${res.id}`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section title="Basics" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Title" htmlFor="guide-title" className="sm:col-span-2">
              <Input id="guide-title" value={form.title} maxLength={140}
                onChange={(e) => { const title = e.target.value; setForm((f) => ({ ...f, title, slug: !editing && (f.slug === "" || f.slug === slugify(f.title)) ? slugify(title) : f.slug })); }} />
            </Field>
            <Field label="Slug" htmlFor="guide-slug" hint="URL path: /guides/<slug>">
              <Input id="guide-slug" value={form.slug} onChange={(e) => set("slug", e.target.value)} />
            </Field>
            <Field label="Category" htmlFor="guide-category">
              <NativeSelect id="guide-category" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">Select a category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            <CountedField label="Intro" id="guide-intro" value={form.intro} onChange={(v) => set("intro", v)} max={600} textarea rows={3} hint="Shown under the title and in listings." />
            <Field label="Cover image key" htmlFor="guide-cover" hint="Storage object key for the hero image.">
              <Input id="guide-cover" value={form.coverKey} onChange={(e) => set("coverKey", e.target.value)} placeholder="guides/cover-prop-creator.webp" />
            </Field>
          </div>
        </Section>

        <Section title="Publishing">
          <div className="space-y-3">
            <Field label="State" htmlFor="guide-state">
              <NativeSelect id="guide-state" value={form.state} onChange={(e) => set("state", e.target.value as GuideFormValue["state"])}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </NativeSelect>
            </Field>
            <Field label="Related tool" htmlFor="guide-tool" hint="Links the guide to a tool page.">
              <NativeSelect id="guide-tool" value={form.toolSlug} onChange={(e) => set("toolSlug", e.target.value)}>
                <option value="">None</option>
                {tools.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Related guide slugs" htmlFor="guide-related" hint="Comma or newline separated.">
              <Input id="guide-related" value={related} onChange={(e) => setRelated(e.target.value)} placeholder="prop-basics, texture-tips" />
            </Field>
          </div>
        </Section>
      </div>

      <Section title="Content" description="Markdown with a live preview.">
        <MarkdownField label="Body" id="guide-content" value={form.content} onChange={(v) => set("content", v)} hint="Headings (##, ###) become the on-page table of contents." />
      </Section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="SEO">
          <div className="space-y-3">
            <CountedField label="SEO title" id="guide-seo-title" value={form.seoTitle} onChange={(v) => set("seoTitle", v)} max={70} hint="Falls back to the guide title when empty." />
            <CountedField label="SEO description" id="guide-seo-desc" value={form.seoDescription} onChange={(v) => set("seoDescription", v)} max={160} textarea rows={3} hint="Falls back to the intro when empty." />
          </div>
        </Section>
        <Section title="FAQs">
          <FaqRepeater faqs={form.faqs} onChange={(f) => set("faqs", f)} />
        </Section>
      </div>

      <EditorBar>
        {editing ? (
          <DeleteButton endpoint={`/api/v1/admin/guides/${initial.id}`} title="Delete this guide?" description="The guide and its content are permanently removed."
            label="Delete" size="default" variant="outline" success="Guide deleted" redirectTo="/admin/guides" />
        ) : null}
        <Button variant="outline" onClick={() => router.push("/admin/guides")}>Cancel</Button>
        <Button loading={isBusy("save")} disabled={!valid} onClick={() => void save()}><Save />{editing ? "Save guide" : "Create guide"}</Button>
      </EditorBar>
    </div>
  );
}
