"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { api, ApiClientError, fieldErrors } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "../hooks";

export function DangerZone() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setErrors({}); setBusy(true);
    try {
      await api("/api/v1/users/me", { method: "DELETE", json: { password, confirm } });
      router.push("/");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401 && err.code !== "INVALID_CREDENTIALS") { router.push("/login"); return; }
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe); else setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Card className="border-danger/40">
      <CardHeader><CardTitle className="flex items-center gap-2 text-danger"><TriangleAlert className="h-4 w-4" aria-hidden /> Danger zone</CardTitle><CardDescription>Deleting your account is permanent.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1 text-sm text-fg-muted">
          <li>• Active subscriptions are cancelled and all sessions are signed out.</li>
          <li>• Uploads, exported resources, Server Hub logs and media are deleted from storage.</li>
          <li>• Remaining credits are forfeited and are not refundable.</li>
          <li>• Billing and audit records are retained where the law requires it.</li>
        </ul>
        <Button variant="destructive" onClick={() => setOpen(true)}>Delete my account</Button>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader><DialogTitle>Delete your account?</DialogTitle><DialogDescription>This cannot be undone. Confirm with your password to continue.</DialogDescription></DialogHeader>
            <Field label="Password" htmlFor="del-pw" error={errors.password}><Input id="del-pw" type="password" autoComplete="current-password" required value={password} invalid={!!errors.password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Field label='Type DELETE to confirm' htmlFor="del-confirm" error={errors.confirm}><Input id="del-confirm" required value={confirm} invalid={!!errors.confirm} autoComplete="off" onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" /></Field>
            {error ? <Alert variant="danger">{error}</Alert> : null}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="destructive" loading={busy} disabled={confirm !== "DELETE" || !password}>Delete account permanently</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
