"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiAction } from "../hooks";
import { CopyButton } from "./copy-button";

export interface TokenRow { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string; revokedAt: string | null }

export function ServerTokens({ projectId, tokens }: { projectId: string; tokens: TokenRow[] }) {
  const router = useRouter();
  const { run, isBusy } = useApiAction();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("default");
  const [raw, setRaw] = React.useState<{ token: string; name: string } | null>(null);
  const [confirm, setConfirm] = React.useState<{ kind: "revoke" | "regenerate"; token: TokenRow } | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run("create", () => api<{ token: string; name: string }>(`/api/v1/server-hub/projects/${projectId}/tokens`, { json: { name: name.trim() || "default" } }));
    if (r) { setRaw(r); setCreating(false); setName("default"); router.refresh(); }
  };
  const doConfirm = async () => {
    if (!confirm) return;
    if (confirm.kind === "revoke") {
      const r = await run("revoke", () => api(`/api/v1/server-hub/projects/${projectId}/tokens/${confirm.token.id}`, { method: "DELETE" }), { success: "Token revoked", refresh: true });
      if (r !== undefined) setConfirm(null);
    } else {
      const r = await run("regen", () => api<{ token: string; name: string }>(`/api/v1/server-hub/projects/${projectId}/tokens/${confirm.token.id}/regenerate`, { method: "POST" }));
      if (r) { setConfirm(null); setRaw(r); router.refresh(); }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Server tokens</h3>
        {creating ? null : <Button size="sm" variant="outline" onClick={() => setCreating(true)}><KeyRound /> Generate token</Button>}
      </div>
      {creating ? (
        <form onSubmit={create} className="flex flex-col gap-2 rounded-md border border-border bg-bg-muted p-3 sm:flex-row sm:items-end">
          <Field label="Token name" htmlFor="token-name" className="flex-1"><Input id="token-name" value={name} maxLength={48} autoFocus onChange={(e) => setName(e.target.value)} placeholder="production" /></Field>
          <div className="flex gap-2"><Button type="submit" size="sm" loading={isBusy("create")}>Create</Button><Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button></div>
        </form>
      ) : null}

      {tokens.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Server tokens</caption>
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle"><th scope="col" className="px-3 py-2">Name</th><th scope="col" className="px-3 py-2">Token</th><th scope="col" className="px-3 py-2">Last used</th><th scope="col" className="px-3 py-2">Created</th><th scope="col" className="px-3 py-2"></th></tr></thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5">{t.name}{t.revokedAt ? <Badge variant="danger" className="ml-2">revoked</Badge> : null}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{t.prefix}••••••••</td>
                  <td className="px-3 py-2.5 text-fg-muted">{t.lastUsedAt ? timeAgo(t.lastUsedAt) : "never"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">{formatDateTime(t.createdAt)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {t.revokedAt ? null : (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "regenerate", token: t })}><RefreshCw /> Regenerate</Button>
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirm({ kind: "revoke", token: t })}><Trash2 /> Revoke</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="rounded-md border border-dashed border-border-strong px-3 py-6 text-center text-sm text-fg-muted">No tokens yet. Generate one and set it as <code className="font-mono">msmhub_token</code> in your server.cfg.</p>}

      <Dialog open={!!raw} onOpenChange={(o) => { if (!o) setRaw(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Copy your token now</DialogTitle><DialogDescription>This is the only time the token is shown. If you lose it, regenerate the token.</DialogDescription></DialogHeader>
          <Alert variant="warning" title="Store it securely"><span className="inline-flex items-start gap-1"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Anyone with this token can send logs and media as your server. Keep it in server.cfg only — never in a client script or a public repo.</span></Alert>
          <div className="flex items-center gap-2 rounded-md border border-border bg-bg-muted p-3"><code className="min-w-0 flex-1 break-all font-mono text-xs">{raw?.token}</code><CopyButton value={raw?.token ?? ""} toastTitle="Token copied" /></div>
          <DialogFooter><Button onClick={() => setRaw(null)}>I've saved it</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{confirm?.kind === "revoke" ? `Revoke "${confirm.token.name}"?` : `Regenerate "${confirm?.token.name}"?`}</DialogTitle>
            <DialogDescription>{confirm?.kind === "revoke" ? "Any server using this token stops ingesting immediately." : "The old token stops working right away and a new one is issued. Update server.cfg afterwards."}</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button><Button variant={confirm?.kind === "revoke" ? "destructive" : "default"} loading={isBusy("revoke") || isBusy("regen")} onClick={doConfirm}>{confirm?.kind === "revoke" ? "Revoke token" : "Regenerate"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
