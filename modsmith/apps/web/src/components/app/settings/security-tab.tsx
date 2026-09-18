"use client";
import * as React from "react";
import { Laptop, LogOut, ShieldCheck } from "lucide-react";
import { LIMITS } from "@modsmith/core";
import { api, fieldErrors } from "@/lib/api-client";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormSuccess } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordHints } from "@/components/auth/password-hints";
import { errorMessage, useApiAction } from "../hooks";

interface SessionRow { id: string; userAgent: string | null; createdAt: string; lastSeenAt: string; expiresAt: string; remember: boolean; current: boolean }

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  return `${browser} on ${os}`;
}

function ChangePassword() {
  const [form, setForm] = React.useState({ current: "", password: "", confirm: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setDone(false); setErrors({});
    const errs: Record<string, string> = {};
    if (!form.current) errs.current = "Enter your current password";
    if (form.password.length < LIMITS.PASSWORD_MIN) errs.password = `Password must be at least ${LIMITS.PASSWORD_MIN} characters`;
    if (form.confirm !== form.password) errs.confirm = "Passwords do not match";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    try { await api("/api/v1/users/me/password", { json: form }); setDone(true); setForm({ current: "", password: "", confirm: "" }); }
    catch (err) { const fe = fieldErrors(err); if (Object.keys(fe).length) setErrors(fe); else setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" aria-hidden /> Change password</CardTitle><CardDescription>Changing your password signs out every other session.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="max-w-md space-y-4">
          <Field label="Current password" htmlFor="cur-pw" error={errors.current}><Input id="cur-pw" type="password" autoComplete="current-password" value={form.current} invalid={!!errors.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></Field>
          <Field label="New password" htmlFor="new-pw" error={errors.password}><Input id="new-pw" type="password" autoComplete="new-password" value={form.password} invalid={!!errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><PasswordHints password={form.password} /></Field>
          <Field label="Confirm new password" htmlFor="conf-pw" error={errors.confirm}><Input id="conf-pw" type="password" autoComplete="new-password" value={form.confirm} invalid={!!errors.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></Field>
          {done ? <FormSuccess message="Password updated. Other sessions were signed out." /> : null}
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <Button type="submit" loading={busy}>Update password</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Sessions() {
  const [sessions, setSessions] = React.useState<SessionRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { run, isBusy } = useApiAction();

  const load = React.useCallback(async () => {
    try { const r = await api<{ sessions: SessionRow[] }>("/api/v1/auth/sessions"); setSessions(r.sessions); setError(null); }
    catch (err) { setError(errorMessage(err)); setSessions([]); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const revoke = (id: string) => run(id, () => api(`/api/v1/auth/sessions/${id}`, { method: "DELETE" }), { success: "Session revoked" }).then((r) => { if (r !== undefined) load(); });
  const revokeAll = () => run("all", () => api("/api/v1/auth/sessions/revoke-all", { method: "POST" }), { success: "Other sessions signed out" }).then((r) => { if (r !== undefined) load(); });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Laptop className="h-4 w-4 text-accent" aria-hidden /> Active sessions</CardTitle><CardDescription>Devices currently signed in to your account.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        {!sessions ? <div className="flex justify-center py-6"><Spinner /></div> : sessions.length === 0 ? <p className="text-sm text-fg-muted">No active sessions found.</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">{describeAgent(s.userAgent)}{s.current ? <Badge variant="success">this device</Badge> : null}{s.remember ? <Badge variant="default">remembered</Badge> : null}</div>
                  <div className="mt-0.5 text-xs text-fg-muted">Last active {timeAgo(s.lastSeenAt)} · signed in {formatDateTime(s.createdAt)}</div>
                </div>
                {!s.current ? <Button variant="ghost" size="sm" loading={isBusy(s.id)} onClick={() => revoke(s.id)}>Revoke</Button> : null}
              </li>
            ))}
          </ul>
        )}
        {sessions && sessions.length > 1 ? <Button variant="outline" size="sm" loading={isBusy("all")} onClick={revokeAll}><LogOut /> Log out all other sessions</Button> : null}
      </CardContent>
    </Card>
  );
}

export function SecurityTab() {
  return <div className="space-y-6"><ChangePassword /><Sessions /></div>;
}
