"use client";
import * as React from "react";
import { Check, Plus, RotateCcw } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap } from "./table";
import { useAdminAction } from "./use-admin-action";

export type AdminSetting = { key: string; value: string | number | boolean; description?: string; stored: boolean; kind: "number" | "string" | "boolean" };

/** Editable system settings. Unstored keys show their code default until saved. */
export function SettingsTable({ settings }: { settings: AdminSetting[] }) {
  const { run, isBusy } = useAdminAction();
  const [values, setValues] = React.useState<Record<string, string>>(() => Object.fromEntries(settings.map((s) => [s.key, String(s.value)])));
  const [saved, setSaved] = React.useState<Record<string, string>>(() => Object.fromEntries(settings.map((s) => [s.key, String(s.value)])));
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newKey, setNewKey] = React.useState("");
  const [newValue, setNewValue] = React.useState("");

  const parse = (raw: string, kind: AdminSetting["kind"]) => {
    if (kind === "number") return Number(raw);
    if (kind === "boolean") return raw === "true";
    return raw;
  };

  const save = async (s: AdminSetting) => {
    const raw = values[s.key] ?? "";
    if (s.kind === "number" && !Number.isFinite(Number(raw))) return;
    const res = await run(s.key, () => api("/api/v1/admin/settings", { method: "PATCH", json: { key: s.key, value: parse(raw, s.kind) } }), { success: `${s.key} saved` });
    if (res !== undefined) setSaved((v) => ({ ...v, [s.key]: raw }));
  };

  const create = async () => {
    const key = newKey.trim();
    if (!key) return;
    const value: string | number = Number.isFinite(Number(newValue)) && newValue.trim() !== "" ? Number(newValue) : newValue;
    const res = await run("create", () => api("/api/v1/admin/settings", { method: "PATCH", json: { key, value } }), { success: "Setting saved" });
    if (res !== undefined) { setCreateOpen(false); setNewKey(""); setNewValue(""); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}><Plus />Add key</Button></div>
      <TableWrap>
        <Table minWidth={860}>
          <THead><Tr><Th>Key</Th><Th>What it controls</Th><Th className="w-52">Value</Th><Th className="text-right">Save</Th></Tr></THead>
          <TBody>
            {settings.length === 0 ? <TableEmpty colSpan={4}>No settings.</TableEmpty> : settings.map((s) => {
              const dirty = (values[s.key] ?? "") !== (saved[s.key] ?? "");
              const asBytes = s.key.endsWith("Bytes") && Number.isFinite(Number(values[s.key]));
              return (
                <Tr key={s.key} className={dirty ? "bg-accent-soft/40" : undefined}>
                  <Td>
                    <div className="font-mono text-xs font-medium">{s.key}</div>
                    {!s.stored ? <Badge variant="outline" className="mt-1">code default</Badge> : null}
                  </Td>
                  <Td className="max-w-[420px] text-fg-muted">{s.description ?? "—"}</Td>
                  <Td>
                    {s.kind === "boolean" ? (
                      <select className="flex h-8 w-full rounded-md border border-border bg-bg-elevated px-2 text-sm" value={values[s.key]} aria-label={s.key}
                        onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <Input className="h-8" type={s.kind === "number" ? "number" : "text"} value={values[s.key] ?? ""} aria-label={s.key}
                        onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))} />
                    )}
                    {asBytes ? <div className="mt-1 text-[11px] text-fg-subtle">{formatBytes(Number(values[s.key]))}</div> : null}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {dirty ? <Button size="icon-sm" variant="ghost" aria-label={`Reset ${s.key}`} onClick={() => setValues((v) => ({ ...v, [s.key]: saved[s.key] ?? "" }))}><RotateCcw /></Button> : null}
                      <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty} loading={isBusy(s.key)} onClick={() => void save(s)}><Check />Save</Button>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </TableWrap>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Add a setting</DialogTitle>
            <DialogDescription>Numeric values are stored as numbers; anything else is stored as a string.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Key" htmlFor="setting-key"><Input id="setting-key" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="credits.signupBonus" /></Field>
            <Field label="Value" htmlFor="setting-value"><Input id="setting-value" value={newValue} onChange={(e) => setNewValue(e.target.value)} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={isBusy("create")} disabled={!newKey.trim()} onClick={() => void create()}>Save setting</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
