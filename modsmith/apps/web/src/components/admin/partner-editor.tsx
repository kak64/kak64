"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { api } from "@/lib/api-client";
import { slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Section } from "./section";
import { EditorBar, MarkdownField } from "./editor-parts";
import { DeleteButton } from "./delete-button";
import { useAdminAction } from "./use-admin-action";

export type PartnerFormValue = {
  id?: string;
  slug: string; name: string; logoUrl: string; description: string; category: string;
  website: string; discordUrl: string; youtubeUrl: string; twitterUrl: string;
  priority: number; active: boolean; referralCode: string; bonusCredits: number; pageContent: string;
};

const url = (v: string) => (v.trim() ? v.trim() : null);

export function PartnerEditor({ initial }: { initial: PartnerFormValue }) {
  const router = useRouter();
  const { run, isBusy } = useAdminAction();
  const [form, setForm] = React.useState<PartnerFormValue>(initial);
  const editing = !!initial.id;
  const set = <K extends keyof PartnerFormValue>(k: K, v: PartnerFormValue[K]) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.slug.trim() && form.name.trim() && form.description.trim() && form.category.trim() && /^[A-Za-z0-9_-]{2,32}$/.test(form.referralCode.trim());

  const save = async () => {
    const body = {
      slug: form.slug.trim(), name: form.name.trim(), logoUrl: url(form.logoUrl), description: form.description.trim(),
      category: form.category.trim(), website: url(form.website), discordUrl: url(form.discordUrl), youtubeUrl: url(form.youtubeUrl), twitterUrl: url(form.twitterUrl),
      priority: form.priority, active: form.active, referralCode: form.referralCode.trim(), bonusCredits: form.bonusCredits,
      pageContent: form.pageContent.trim() ? form.pageContent : null,
    };
    const res = await run("save", () => editing
      ? api<{ id: string }>(`/api/v1/admin/partners/${initial.id}`, { method: "PATCH", json: body })
      : api<{ id: string }>("/api/v1/admin/partners", { json: body }), { success: editing ? "Partner saved" : "Partner created", refresh: editing });
    if (res && !editing) router.push(`/admin/partners/${res.id}`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section title="Partner" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="p-name">
              <Input id="p-name" maxLength={64} value={form.name}
                onChange={(e) => { const name = e.target.value; setForm((f) => ({ ...f, name, slug: !editing && (f.slug === "" || f.slug === slugify(f.name)) ? slugify(name) : f.slug })); }} />
            </Field>
            <Field label="Slug" htmlFor="p-slug" hint="/partners/<slug>"><Input id="p-slug" value={form.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
            <Field label="Category" htmlFor="p-category" hint="e.g. server, creator, community"><Input id="p-category" maxLength={32} value={form.category} onChange={(e) => set("category", e.target.value)} /></Field>
            <Field label="Priority" htmlFor="p-priority" hint="Higher shows first."><Input id="p-priority" type="number" value={form.priority} onChange={(e) => set("priority", Number(e.target.value))} /></Field>
            <Field label="Description" htmlFor="p-desc" className="sm:col-span-2" hint="Up to 600 characters — used on cards and the partner page.">
              <Textarea id="p-desc" rows={3} maxLength={600} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field label="Website" htmlFor="p-website"><Input id="p-website" type="url" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></Field>
            <Field label="Discord URL" htmlFor="p-discord"><Input id="p-discord" type="url" value={form.discordUrl} onChange={(e) => set("discordUrl", e.target.value)} placeholder="https://discord.gg/…" /></Field>
            <Field label="YouTube URL" htmlFor="p-youtube"><Input id="p-youtube" type="url" value={form.youtubeUrl} onChange={(e) => set("youtubeUrl", e.target.value)} placeholder="https://youtube.com/@…" /></Field>
            <Field label="X / Twitter URL" htmlFor="p-twitter"><Input id="p-twitter" type="url" value={form.twitterUrl} onChange={(e) => set("twitterUrl", e.target.value)} placeholder="https://x.com/…" /></Field>
          </div>
        </Section>

        <Section title="Logo & referral">
          <div className="space-y-3">
            <Field label="Logo URL" htmlFor="p-logo"><Input id="p-logo" type="url" value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://" /></Field>
            <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border-strong bg-bg-muted/40 p-2">
              {form.logoUrl.trim()
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={form.logoUrl} alt={`${form.name || "Partner"} logo preview`} className="max-h-20 max-w-full object-contain" />
                : <span className="text-xs text-fg-subtle">Logo preview</span>}
            </div>
            <Field label="Referral code" htmlFor="p-code" hint="2–32 characters: letters, numbers, _ and -">
              <Input id="p-code" value={form.referralCode} onChange={(e) => set("referralCode", e.target.value)} />
            </Field>
            <Field label="Bonus credits" htmlFor="p-bonus" hint="Granted once to users who sign up with this code.">
              <Input id="p-bonus" type="number" min={0} value={form.bonusCredits} onChange={(e) => set("bonusCredits", Number(e.target.value))} />
            </Field>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.active} onCheckedChange={(v) => set("active", v)} aria-label="Active" />Active</label>
          </div>
        </Section>
      </div>

      <Section title="Partner page content" description="Optional Markdown shown on /partners/<slug>.">
        <MarkdownField label="Content" id="p-content" value={form.pageContent} onChange={(v) => set("pageContent", v)} rows={14} />
      </Section>

      <EditorBar>
        {editing ? (
          <DeleteButton endpoint={`/api/v1/admin/partners/${initial.id}`} title="Delete this partner?" description="The partner, its page and its referral stats are permanently removed."
            label="Delete" size="default" variant="outline" success="Partner deleted" redirectTo="/admin/partners" />
        ) : null}
        <Button variant="outline" onClick={() => router.push("/admin/partners")}>Cancel</Button>
        <Button loading={isBusy("save")} disabled={!valid} onClick={() => void save()}><Save />{editing ? "Save partner" : "Create partner"}</Button>
      </EditorBar>
    </div>
  );
}
