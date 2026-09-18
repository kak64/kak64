"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap } from "./table";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

export type AdminFlag = { key: string; description: string | null; enabled: boolean; updatedAt: string };

export function FlagsTable({ flags }: { flags: AdminFlag[] }) {
  const { run, isBusy } = useAdminAction();
  const [state, setState] = React.useState(() => Object.fromEntries(flags.map((f) => [f.key, f.enabled])));
  const [pending, setPending] = React.useState<{ key: string; next: boolean } | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newKey, setNewKey] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [newEnabled, setNewEnabled] = React.useState(false);

  const toggle = async (key: string, next: boolean) => {
    const res = await run(key, () => api(`/api/v1/admin/flags/${encodeURIComponent(key)}`, { method: "PATCH", json: { enabled: next } }), { success: `${key} ${next ? "enabled" : "disabled"}` });
    if (res !== undefined) setState((s) => ({ ...s, [key]: next }));
    setPending(null);
  };

  const create = async () => {
    const key = newKey.trim();
    if (!key) return;
    const res = await run("create", () => api(`/api/v1/admin/flags/${encodeURIComponent(key)}`, { method: "PATCH", json: { enabled: newEnabled, description: newDescription.trim() || undefined } }), { success: "Flag created" });
    if (res !== undefined) { setCreateOpen(false); setNewKey(""); setNewDescription(""); setNewEnabled(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" onClick={() => setCreateOpen(true)}><Plus />New flag</Button></div>
      <TableWrap>
        <Table minWidth={720}>
          <THead><Tr><Th>Key</Th><Th>Description</Th><Th>Updated</Th><Th className="text-right">Enabled</Th></Tr></THead>
          <TBody>
            {flags.length === 0 ? <TableEmpty colSpan={4}>No feature flags defined yet.</TableEmpty> : flags.map((f) => (
              <Tr key={f.key}>
                <Td className="font-mono text-xs font-medium">{f.key}</Td>
                <Td className="max-w-[420px] text-fg-muted">{f.description ?? "—"}</Td>
                <Td className="whitespace-nowrap text-fg-muted">{timeAgo(f.updatedAt)}</Td>
                <Td className="text-right">
                  <Switch checked={state[f.key] ?? false} disabled={isBusy(f.key)} aria-label={`Toggle ${f.key}`}
                    onCheckedChange={(next) => setPending({ key: f.key, next })} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableWrap>

      <ConfirmDialog open={!!pending} onOpenChange={() => setPending(null)} destructive={pending?.next === false}
        title={pending ? `${pending.next ? "Enable" : "Disable"} ${pending.key}?` : ""}
        description="Feature flags take effect within 30 seconds across the app."
        confirmLabel={pending?.next ? "Enable" : "Disable"} loading={!!pending && isBusy(pending.key)}
        onConfirm={() => { if (pending) void toggle(pending.key, pending.next); }} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>New feature flag</DialogTitle>
            <DialogDescription>Keys are checked with isFlagEnabled() in server code.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Key" htmlFor="flag-key" hint="e.g. showcase.remixes"><Input id="flag-key" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="feature.key" /></Field>
            <Field label="Description" htmlFor="flag-desc"><Input id="flag-desc" maxLength={200} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} /></Field>
            <label className="flex items-center gap-2 text-sm"><Switch checked={newEnabled} onCheckedChange={setNewEnabled} aria-label="Enabled on creation" />Enabled immediately</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={isBusy("create")} disabled={!newKey.trim()} onClick={() => void create()}>Create flag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
