"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FormError, FormSuccess } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { errorMessage, retryAfterSeconds } from "@/components/app/hooks";
import { AuthHeading } from "./auth-heading";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const reset = params.get("reset") === "1";
  const [form, setForm] = React.useState({ identifier: "", password: "", remember: true });
  const [error, setError] = React.useState<string | null>(null);
  const [suspended, setSuspended] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (retry <= 0) return; const t = setTimeout(() => setRetry((r) => r - 1), 1000); return () => clearTimeout(t); }, [retry]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null); setSuspended(false);
    if (!form.identifier.trim() || !form.password) { setError("Enter your email/username and password."); return; }
    setBusy(true);
    try {
      const data = await api<{ redirect: string }>("/api/v1/auth/login", { json: { identifier: form.identifier.trim(), password: form.password, remember: form.remember, next: next ?? undefined } });
      router.push(next ?? data.redirect ?? "/app");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "ACCOUNT_DISABLED") setSuspended(true);
      else if (err instanceof ApiClientError && err.code === "RATE_LIMITED") { const s = retryAfterSeconds(err); if (s) setRetry(s); setError(errorMessage(err)); }
      else if (err instanceof ApiClientError && err.code === "INVALID_CREDENTIALS") setError("Invalid email/username or password.");
      else setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <AuthHeading title="Welcome back" description="Log in to your workshop." />
      {reset ? <FormSuccess message="Your password was reset. Log in with your new password." /> : null}
      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        <Field label="Email or username" htmlFor="identifier">
          <Input id="identifier" autoComplete="username" required value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
        </Field>
        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input id="password" type={showPw ? "text" : "password"} autoComplete="current-password" required className="pr-10" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" className="absolute inset-y-0 right-0 px-3 text-fg-subtle hover:text-fg" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"}>{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
        </Field>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox id="remember" checked={form.remember} onCheckedChange={(v) => setForm({ ...form, remember: v === true })} />
            <Label htmlFor="remember" className="font-normal text-fg-muted">Remember me for 30 days</Label>
          </div>
          <Link href="/forgot" className="text-sm text-accent hover:underline">Forgot password?</Link>
        </div>
        {suspended ? <Alert variant="danger" title="Account suspended">This account has been suspended. Contact support if you believe this is a mistake.</Alert> : null}
        <FormError message={error} />
        <Button type="submit" className="w-full" loading={busy} disabled={retry > 0}>{retry > 0 ? `Try again in ${retry}s` : "Log in"}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-fg-muted">New to Modsmith? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-accent hover:underline">Create an account</Link></p>
    </>
  );
}
