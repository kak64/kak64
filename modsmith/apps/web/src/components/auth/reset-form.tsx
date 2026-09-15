"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LIMITS } from "@modsmith/core";
import { api, ApiClientError, fieldErrors } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { errorMessage } from "@/components/app/hooks";
import { PasswordHints } from "./password-hints";
import { AuthHeading } from "./auth-heading";

export function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [form, setForm] = React.useState({ password: "", confirm: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [tokenState, setTokenState] = React.useState<"ok" | "invalid" | "expired">(token ? "ok" : "invalid");
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    const e: Record<string, string> = {};
    if (form.password.length < LIMITS.PASSWORD_MIN) e.password = `Password must be at least ${LIMITS.PASSWORD_MIN} characters`;
    if (form.confirm !== form.password) e.confirm = "Passwords do not match";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await api("/api/v1/auth/reset", { json: { token, password: form.password, confirm: form.confirm } }); setDone(true); }
    catch (err) {
      if (err instanceof ApiClientError && err.code === "TOKEN_INVALID") setTokenState("invalid");
      else if (err instanceof ApiClientError && err.code === "TOKEN_EXPIRED") setTokenState("expired");
      else { const fe = fieldErrors(err); if (Object.keys(fe).length) setErrors(fe); else setError(errorMessage(err)); }
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <>
        <AuthHeading title="Password updated" description="All other sessions were signed out. You can log in with your new password now." />
        <Button className="w-full" asChild><Link href="/login?reset=1">Go to log in</Link></Button>
      </>
    );
  }
  if (tokenState !== "ok") {
    return (
      <>
        <AuthHeading title={tokenState === "expired" ? "This link has expired" : "This link is invalid"} />
        <Alert variant="warning">{tokenState === "expired" ? "Reset links are valid for 60 minutes. Request a new one to continue." : "This reset link is invalid or was already used. Request a new one to continue."}</Alert>
        <Button className="mt-4 w-full" asChild><Link href="/forgot">Request a new link</Link></Button>
      </>
    );
  }
  return (
    <>
      <AuthHeading title="Choose a new password" />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="New password" htmlFor="password" error={errors.password}>
          <Input id="password" type="password" autoComplete="new-password" required minLength={LIMITS.PASSWORD_MIN} value={form.password} invalid={!!errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <PasswordHints password={form.password} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm}>
          <Input id="confirm" type="password" autoComplete="new-password" required value={form.confirm} invalid={!!errors.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </Field>
        <FormError message={error} />
        <Button type="submit" className="w-full" loading={busy}>Update password</Button>
      </form>
    </>
  );
}
