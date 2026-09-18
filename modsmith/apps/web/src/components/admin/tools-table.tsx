"use client";
import * as React from "react";
import { Check, RotateCcw } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap } from "./table";
import { useAdminAction } from "./use-admin-action";

export type AdminTool = {
  slug: string; name: string; category: string; creditCost: number; status: string;
  enabled: boolean; requiresSubscription: boolean; requiresVerification: boolean; freeDailyExports: number;
};

const STATUSES = ["live", "beta", "new", "coming_soon", "maintenance"];

type Draft = Pick<AdminTool, "creditCost" | "status" | "enabled" | "requiresSubscription" | "requiresVerification" | "freeDailyExports">;

function draftOf(t: AdminTool): Draft {
  return { creditCost: t.creditCost, status: t.status, enabled: t.enabled, requiresSubscription: t.requiresSubscription, requiresVerification: t.requiresVerification, freeDailyExports: t.freeDailyExports };
}

/** Inline editor for ToolConfig rows; each row saves independently. */
export function ToolsTable({ tools }: { tools: AdminTool[] }) {
  const { run, isBusy } = useAdminAction();
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>(() => Object.fromEntries(tools.map((t) => [t.slug, draftOf(t)])));
  const [saved, setSaved] = React.useState<Record<string, AdminTool>>(() => Object.fromEntries(tools.map((t) => [t.slug, t])));

  const setField = <K extends keyof Draft>(slug: string, key: K, value: Draft[K]) =>
    setDrafts((d) => ({ ...d, [slug]: { ...d[slug]!, [key]: value } }));

  const dirty = (slug: string) => JSON.stringify(drafts[slug]) !== JSON.stringify(draftOf(saved[slug]!));

  const save = async (slug: string) => {
    const body = drafts[slug]!;
    const res = await run(slug, () => api<AdminTool>(`/api/v1/admin/tools/${slug}`, { method: "PATCH", json: body }), { success: `${saved[slug]!.name} updated` });
    if (res) setSaved((s) => ({ ...s, [slug]: { ...s[slug]!, ...body } }));
  };

  return (
    <TableWrap>
      <Table minWidth={1080}>
        <THead>
          <Tr><Th>Tool</Th><Th className="text-right">Credit cost</Th><Th>Status</Th><Th className="text-center">Enabled</Th><Th className="text-center">Subscription</Th><Th className="text-center">Verified</Th><Th className="text-right">Free daily</Th><Th className="text-right">Save</Th></Tr>
        </THead>
        <TBody>
          {tools.length === 0 ? <TableEmpty colSpan={8}>No tool configuration rows. Seed the database first.</TableEmpty> : tools.map((t) => {
            const d = drafts[t.slug]!;
            const changed = dirty(t.slug);
            return (
              <Tr key={t.slug} className={changed ? "bg-accent-soft/40" : undefined}>
                <Td>
                  <div className="font-medium">{t.name}</div>
                  <div className="font-mono text-[11px] text-fg-subtle">{t.slug} · {t.category}</div>
                </Td>
                <Td className="text-right">
                  <Input type="number" min={0} step={1} value={d.creditCost} aria-label={`${t.name} credit cost`}
                    onChange={(e) => setField(t.slug, "creditCost", Number(e.target.value))} className="ml-auto h-8 w-24 text-right" />
                </Td>
                <Td>
                  <NativeSelect value={d.status} aria-label={`${t.name} status`} className="h-8 w-36 text-xs" onChange={(e) => setField(t.slug, "status", e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </NativeSelect>
                </Td>
                <Td className="text-center"><Switch checked={d.enabled} onCheckedChange={(v) => setField(t.slug, "enabled", v)} aria-label={`${t.name} enabled`} /></Td>
                <Td className="text-center"><Switch checked={d.requiresSubscription} onCheckedChange={(v) => setField(t.slug, "requiresSubscription", v)} aria-label={`${t.name} requires subscription`} /></Td>
                <Td className="text-center"><Switch checked={d.requiresVerification} onCheckedChange={(v) => setField(t.slug, "requiresVerification", v)} aria-label={`${t.name} requires verified email`} /></Td>
                <Td className="text-right">
                  <Input type="number" min={0} step={1} value={d.freeDailyExports} aria-label={`${t.name} free daily exports`}
                    onChange={(e) => setField(t.slug, "freeDailyExports", Number(e.target.value))} className="ml-auto h-8 w-20 text-right" />
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {changed ? <Button size="icon-sm" variant="ghost" aria-label={`Reset ${t.name}`} onClick={() => setDrafts((s) => ({ ...s, [t.slug]: draftOf(saved[t.slug]!) }))}><RotateCcw /></Button> : null}
                    <Button size="sm" variant={changed ? "default" : "outline"} disabled={!changed} loading={isBusy(t.slug)} onClick={() => void save(t.slug)}><Check />Save</Button>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-xs text-fg-subtle">
        <Badge variant="outline">inline edit</Badge> Changes apply per row and bust the tools cache immediately.
      </div>
    </TableWrap>
  );
}
