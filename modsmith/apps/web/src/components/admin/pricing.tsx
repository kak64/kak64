"use client";
import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatBytes, formatCredits, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap, Bool } from "./table";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";
import { GB } from "./helpers";

export type AdminPack = {
  id: string; slug: string; name: string; credits: number; bonusCredits: number; priceCents: number; currency: string;
  stripePriceId: string | null; isCustom: boolean; minCredits: number | null; maxCredits: number | null; badge: string | null; sortOrder: number; active: boolean;
};

export type AdminPlan = {
  id: string; slug: string; kind: "CREATOR" | "SERVER_HUB"; name: string; description: string | null;
  monthlyPriceCents: number; yearlyPriceCents: number; currency: string; stripeMonthlyPriceId: string | null; stripeYearlyPriceId: string | null;
  monthlyCredits: number; exportDiscountPct: number; premiumTools: boolean; aiTools: boolean; faceDailyExports: number | null;
  hubStorageBytes: number | null; hubRetentionDays: number | null; hubMaxServers: number | null; features: string[]; sortOrder: number; active: boolean;
};

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

function emptyPack(): AdminPack {
  return { id: "", slug: "", name: "", credits: 1000, bonusCredits: 0, priceCents: 999, currency: "usd", stripePriceId: null, isCustom: false, minCredits: null, maxCredits: null, badge: null, sortOrder: 0, active: true };
}
function emptyPlan(): AdminPlan {
  return { id: "", slug: "", kind: "CREATOR", name: "", description: null, monthlyPriceCents: 0, yearlyPriceCents: 0, currency: "usd", stripeMonthlyPriceId: null, stripeYearlyPriceId: null, monthlyCredits: 0, exportDiscountPct: 0, premiumTools: false, aiTools: false, faceDailyExports: null, hubStorageBytes: null, hubRetentionDays: null, hubMaxServers: null, features: [], sortOrder: 0, active: true };
}

function PackDialog({ pack, open, onOpenChange }: { pack: AdminPack | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { run, isBusy } = useAdminAction();
  const [form, setForm] = React.useState<AdminPack>(pack ?? emptyPack());
  React.useEffect(() => { if (open) setForm(pack ?? emptyPack()); }, [open, pack]);
  const editing = !!pack?.id;
  const set = <K extends keyof AdminPack>(k: K, v: AdminPack[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const body = {
      slug: form.slug.trim(), name: form.name.trim(), credits: form.credits, bonusCredits: form.bonusCredits, priceCents: form.priceCents,
      currency: form.currency.trim().toLowerCase(), stripePriceId: nullable(form.stripePriceId ?? ""), isCustom: form.isCustom,
      minCredits: form.minCredits, maxCredits: form.maxCredits, badge: nullable(form.badge ?? ""), sortOrder: form.sortOrder, active: form.active,
    };
    const res = await run("pack", () => editing
      ? api(`/api/v1/admin/packs/${pack!.id}`, { method: "PATCH", json: body })
      : api("/api/v1/admin/packs", { json: body }), { success: editing ? "Pack updated" : "Pack created" });
    if (res !== undefined) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${pack!.name}` : "New credit pack"}</DialogTitle>
          <DialogDescription>Packs appear on the credits page. Custom packs let buyers choose a quantity; their price is per credit.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Slug" htmlFor="pack-slug" hint="lowercase-with-dashes"><Input id="pack-slug" value={form.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
          <Field label="Name" htmlFor="pack-name"><Input id="pack-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Credits" htmlFor="pack-credits"><Input id="pack-credits" type="number" min={1} value={form.credits} onChange={(e) => set("credits", Number(e.target.value))} /></Field>
          <Field label="Bonus credits" htmlFor="pack-bonus"><Input id="pack-bonus" type="number" min={0} value={form.bonusCredits} onChange={(e) => set("bonusCredits", Number(e.target.value))} /></Field>
          <Field label="Price (cents)" htmlFor="pack-price" hint={formatMoney(form.priceCents || 0, form.currency)}>
            <Input id="pack-price" type="number" min={1} value={form.priceCents} onChange={(e) => set("priceCents", Number(e.target.value))} />
          </Field>
          <Field label="Currency" htmlFor="pack-currency" hint="3-letter ISO code"><Input id="pack-currency" maxLength={3} value={form.currency} onChange={(e) => set("currency", e.target.value)} /></Field>
          <Field label="Stripe price id" htmlFor="pack-stripe" className="sm:col-span-2"><Input id="pack-stripe" value={form.stripePriceId ?? ""} onChange={(e) => set("stripePriceId", e.target.value)} placeholder="price_…" /></Field>
          <Field label="Badge" htmlFor="pack-badge" hint="Optional ribbon, e.g. “Best value”"><Input id="pack-badge" maxLength={24} value={form.badge ?? ""} onChange={(e) => set("badge", e.target.value)} /></Field>
          <Field label="Sort order" htmlFor="pack-sort"><Input id="pack-sort" type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} /></Field>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-6 rounded-md border border-border bg-bg-muted/40 px-3 py-2.5">
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.isCustom} onCheckedChange={(v) => set("isCustom", v)} aria-label="Custom quantity pack" />Custom quantity</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.active} onCheckedChange={(v) => set("active", v)} aria-label="Active" />Active</label>
          </div>
          {form.isCustom ? (
            <>
              <Field label="Min credits" htmlFor="pack-min"><Input id="pack-min" type="number" value={form.minCredits ?? ""} onChange={(e) => set("minCredits", num(e.target.value))} /></Field>
              <Field label="Max credits" htmlFor="pack-max"><Input id="pack-max" type="number" value={form.maxCredits ?? ""} onChange={(e) => set("maxCredits", num(e.target.value))} /></Field>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={isBusy("pack")} disabled={!form.slug.trim() || !form.name.trim()} onClick={() => void submit()}>{editing ? "Save pack" : "Create pack"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({ plan, open, onOpenChange }: { plan: AdminPlan | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { run, isBusy } = useAdminAction();
  const [form, setForm] = React.useState<AdminPlan>(plan ?? emptyPlan());
  const [featuresText, setFeaturesText] = React.useState((plan?.features ?? []).join("\n"));
  const [storageGb, setStorageGb] = React.useState(plan?.hubStorageBytes ? String(plan.hubStorageBytes / GB) : "");
  React.useEffect(() => {
    if (!open) return;
    setForm(plan ?? emptyPlan());
    setFeaturesText((plan?.features ?? []).join("\n"));
    setStorageGb(plan?.hubStorageBytes ? String(plan.hubStorageBytes / GB) : "");
  }, [open, plan]);
  const editing = !!plan?.id;
  const set = <K extends keyof AdminPlan>(k: K, v: AdminPlan[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const gb = num(storageGb);
    const body = {
      slug: form.slug.trim(), kind: form.kind, name: form.name.trim(), description: nullable(form.description ?? ""),
      monthlyPriceCents: form.monthlyPriceCents, yearlyPriceCents: form.yearlyPriceCents, currency: form.currency.trim().toLowerCase(),
      stripeMonthlyPriceId: nullable(form.stripeMonthlyPriceId ?? ""), stripeYearlyPriceId: nullable(form.stripeYearlyPriceId ?? ""),
      monthlyCredits: form.monthlyCredits, exportDiscountPct: form.exportDiscountPct, premiumTools: form.premiumTools, aiTools: form.aiTools,
      faceDailyExports: form.faceDailyExports, hubStorageBytes: gb === null ? null : Math.round(gb * GB),
      hubRetentionDays: form.hubRetentionDays, hubMaxServers: form.hubMaxServers,
      features: featuresText.split("\n").map((s) => s.trim()).filter(Boolean),
      sortOrder: form.sortOrder, active: form.active,
    };
    const res = await run("plan", () => editing
      ? api(`/api/v1/admin/plans/${plan!.id}`, { method: "PATCH", json: body })
      : api("/api/v1/admin/plans", { json: body }), { success: editing ? "Plan updated" : "Plan created" });
    if (res !== undefined) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${plan!.name}` : "New subscription plan"}</DialogTitle>
          <DialogDescription>Creator plans gate tools and grant monthly credits; Server Hub plans set storage, retention and server limits.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Slug" htmlFor="plan-slug"><Input id="plan-slug" value={form.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
          <Field label="Name" htmlFor="plan-name"><Input id="plan-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Kind" htmlFor="plan-kind">
            <NativeSelect id="plan-kind" value={form.kind} onChange={(e) => set("kind", e.target.value as AdminPlan["kind"])}>
              <option value="CREATOR">Creator</option>
              <option value="SERVER_HUB">Server Hub</option>
            </NativeSelect>
          </Field>
          <Field label="Description" htmlFor="plan-desc" className="sm:col-span-2 lg:col-span-3"><Input id="plan-desc" maxLength={300} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="Monthly price (cents)" htmlFor="plan-month" hint={formatMoney(form.monthlyPriceCents || 0, form.currency)}><Input id="plan-month" type="number" min={0} value={form.monthlyPriceCents} onChange={(e) => set("monthlyPriceCents", Number(e.target.value))} /></Field>
          <Field label="Yearly price (cents)" htmlFor="plan-year" hint={formatMoney(form.yearlyPriceCents || 0, form.currency)}><Input id="plan-year" type="number" min={0} value={form.yearlyPriceCents} onChange={(e) => set("yearlyPriceCents", Number(e.target.value))} /></Field>
          <Field label="Currency" htmlFor="plan-currency"><Input id="plan-currency" maxLength={3} value={form.currency} onChange={(e) => set("currency", e.target.value)} /></Field>
          <Field label="Stripe monthly price id" htmlFor="plan-sm"><Input id="plan-sm" value={form.stripeMonthlyPriceId ?? ""} onChange={(e) => set("stripeMonthlyPriceId", e.target.value)} placeholder="price_…" /></Field>
          <Field label="Stripe yearly price id" htmlFor="plan-sy"><Input id="plan-sy" value={form.stripeYearlyPriceId ?? ""} onChange={(e) => set("stripeYearlyPriceId", e.target.value)} placeholder="price_…" /></Field>
          <Field label="Sort order" htmlFor="plan-sort"><Input id="plan-sort" type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} /></Field>
          <Field label="Monthly credits" htmlFor="plan-credits"><Input id="plan-credits" type="number" min={0} value={form.monthlyCredits} onChange={(e) => set("monthlyCredits", Number(e.target.value))} /></Field>
          <Field label="Export discount %" htmlFor="plan-discount"><Input id="plan-discount" type="number" min={0} max={100} value={form.exportDiscountPct} onChange={(e) => set("exportDiscountPct", Number(e.target.value))} /></Field>
          <Field label="Face daily exports" htmlFor="plan-face" hint="Blank = no override"><Input id="plan-face" type="number" min={0} value={form.faceDailyExports ?? ""} onChange={(e) => set("faceDailyExports", num(e.target.value))} /></Field>
          <Field label="Hub storage (GB)" htmlFor="plan-storage" hint={storageGb ? formatBytes(Number(storageGb) * GB) : "Blank = no hub storage"}>
            <Input id="plan-storage" type="number" min={0} step="0.5" value={storageGb} onChange={(e) => setStorageGb(e.target.value)} />
          </Field>
          <Field label="Hub retention (days)" htmlFor="plan-retention"><Input id="plan-retention" type="number" min={1} value={form.hubRetentionDays ?? ""} onChange={(e) => set("hubRetentionDays", num(e.target.value))} /></Field>
          <Field label="Hub max servers" htmlFor="plan-servers"><Input id="plan-servers" type="number" min={1} value={form.hubMaxServers ?? ""} onChange={(e) => set("hubMaxServers", num(e.target.value))} /></Field>
          <Field label="Features" htmlFor="plan-features" hint="One per line — shown on the pricing page." className="sm:col-span-2 lg:col-span-3">
            <Textarea id="plan-features" rows={5} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} placeholder={"Unlimited exports\nPriority queue"} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-6 rounded-md border border-border bg-bg-muted/40 px-3 py-2.5">
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.premiumTools} onCheckedChange={(v) => set("premiumTools", v)} aria-label="Premium tools" />Premium tools</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.aiTools} onCheckedChange={(v) => set("aiTools", v)} aria-label="AI tools" />AI tools</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.active} onCheckedChange={(v) => set("active", v)} aria-label="Active" />Active</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={isBusy("plan")} disabled={!form.slug.trim() || !form.name.trim()} onClick={() => void submit()}>{editing ? "Save plan" : "Create plan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRow({ label, endpoint, entity }: { label: string; endpoint: string; entity: string }) {
  const { run, isBusy } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="icon-sm" variant="ghost" aria-label={`Delete ${label}`} onClick={() => setOpen(true)}><Trash2 className="text-danger" /></Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} destructive title={`Delete ${label}?`}
        description={`This removes the ${entity} permanently. Existing purchases and subscriptions keep their historical record.`}
        confirmLabel="Delete" loading={isBusy("delete")}
        onConfirm={async () => { const r = await run("delete", () => api(endpoint, { method: "DELETE" }), { success: `${label} deleted` }); if (r !== undefined) setOpen(false); }} />
    </>
  );
}

export function PricingManager({ packs, plans }: { packs: AdminPack[]; plans: AdminPlan[] }) {
  const [packDialog, setPackDialog] = React.useState<{ open: boolean; pack: AdminPack | null }>({ open: false, pack: null });
  const [planDialog, setPlanDialog] = React.useState<{ open: boolean; plan: AdminPlan | null }>({ open: false, plan: null });

  return (
    <Tabs defaultValue="packs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="packs">Credit packs ({packs.length})</TabsTrigger>
          <TabsTrigger value="plans">Subscription plans ({plans.length})</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="packs" className="space-y-3">
        <div className="flex justify-end"><Button size="sm" onClick={() => setPackDialog({ open: true, pack: null })}><Plus />New pack</Button></div>
        <TableWrap>
          <Table minWidth={980}>
            <THead><Tr><Th>Pack</Th><Th className="text-right">Credits</Th><Th className="text-right">Bonus</Th><Th className="text-right">Price</Th><Th>Stripe</Th><Th>Badge</Th><Th className="text-center">Custom</Th><Th className="text-center">Active</Th><Th className="text-right">Order</Th><Th className="text-right">Actions</Th></Tr></THead>
            <TBody>
              {packs.length === 0 ? <TableEmpty colSpan={10}>No credit packs yet — create the first one.</TableEmpty> : packs.map((p) => (
                <Tr key={p.id}>
                  <Td><div className="font-medium">{p.name}</div><div className="font-mono text-[11px] text-fg-subtle">{p.slug}</div></Td>
                  <Td className="text-right tabular-nums">{formatCredits(p.credits)}</Td>
                  <Td className="text-right tabular-nums text-success">{p.bonusCredits ? `+${formatCredits(p.bonusCredits)}` : "—"}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(p.priceCents, p.currency)}{p.isCustom ? <span className="text-fg-subtle"> /cr</span> : null}</Td>
                  <Td className="max-w-[160px] truncate font-mono text-[11px] text-fg-subtle" title={p.stripePriceId ?? ""}>{p.stripePriceId ?? "—"}</Td>
                  <Td>{p.badge ? <Badge variant="accent">{p.badge}</Badge> : "—"}</Td>
                  <Td className="text-center"><Bool value={p.isCustom} /></Td>
                  <Td className="text-center"><Bool value={p.active} /></Td>
                  <Td className="text-right tabular-nums text-fg-muted">{p.sortOrder}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setPackDialog({ open: true, pack: p })}><Pencil /></Button>
                      <DeleteRow label={p.name} entity="credit pack" endpoint={`/api/v1/admin/packs/${p.id}`} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </TabsContent>

      <TabsContent value="plans" className="space-y-3">
        <div className="flex justify-end"><Button size="sm" onClick={() => setPlanDialog({ open: true, plan: null })}><Plus />New plan</Button></div>
        <TableWrap>
          <Table minWidth={1080}>
            <THead><Tr><Th>Plan</Th><Th>Kind</Th><Th className="text-right">Monthly</Th><Th className="text-right">Yearly</Th><Th className="text-right">Credits/mo</Th><Th className="text-right">Discount</Th><Th>Hub storage</Th><Th className="text-center">Active</Th><Th className="text-right">Actions</Th></Tr></THead>
            <TBody>
              {plans.length === 0 ? <TableEmpty colSpan={9}>No subscription plans yet.</TableEmpty> : plans.map((p) => (
                <Tr key={p.id}>
                  <Td><div className="font-medium">{p.name}</div><div className="font-mono text-[11px] text-fg-subtle">{p.slug}</div></Td>
                  <Td><Badge variant={p.kind === "SERVER_HUB" ? "info" : "default"}>{p.kind === "SERVER_HUB" ? "server hub" : "creator"}</Badge></Td>
                  <Td className="text-right tabular-nums">{formatMoney(p.monthlyPriceCents, p.currency)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(p.yearlyPriceCents, p.currency)}</Td>
                  <Td className="text-right tabular-nums">{formatCredits(p.monthlyCredits)}</Td>
                  <Td className="text-right tabular-nums">{p.exportDiscountPct}%</Td>
                  <Td className="text-fg-muted">{p.hubStorageBytes ? formatBytes(p.hubStorageBytes) : "—"}</Td>
                  <Td className="text-center"><Bool value={p.active} /></Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setPlanDialog({ open: true, plan: p })}><Pencil /></Button>
                      <DeleteRow label={p.name} entity="plan" endpoint={`/api/v1/admin/plans/${p.id}`} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </TabsContent>

      <PackDialog open={packDialog.open} pack={packDialog.pack} onOpenChange={(o) => setPackDialog((s) => ({ ...s, open: o }))} />
      <PlanDialog open={planDialog.open} plan={planDialog.plan} onOpenChange={(o) => setPlanDialog((s) => ({ ...s, open: o }))} />
    </Tabs>
  );
}
