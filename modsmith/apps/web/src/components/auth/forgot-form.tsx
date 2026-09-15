"use client";
import * as React from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError, FormSuccess } from "@/components/ui/form";
import { errorMessage } from "@/components/app/hooks";
import { AuthHeading } from "./auth-heading";

const NEUTRAL = "If an account exists for that email, a reset link has been sent. Check your inbox and spam folder.";

export function ForgotForm() {
  const [email, setEmail] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (!email.trim()) { setError("Enter your email address."); return; }
    setBusy(true);
    try { await api("/api/v1/auth/forgot", { json: { email: email.trim() } }); setDone(true); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <>
      <AuthHeading title="Reset your password" description="Enter the email you signed up with and we'll send a reset link." />
      {done ? (
        <div className="space-y-4">
          <FormSuccess message={NEUTRAL} />
          <Button variant="outline" className="w-full" asChild><Link href="/login">Back to log in</Link></Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <FormError message={error} />
          <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-fg-muted">Remembered it? <Link href="/login" className="font-medium text-accent hover:underline">Log in</Link></p>
    </>
  );
}
