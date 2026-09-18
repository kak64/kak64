"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { LIMITS, USERNAME_REGEX } from "@modsmith/core";
import { api, ApiClientError, fieldErrors } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FormError } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/components/app/hooks";
import { PasswordHints } from "./password-hints";
import { AuthHeading } from "./auth-heading";

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const ref = params.get("ref") ?? undefined;
  const partner = params.get("partner") ?? undefined;
  const [form, setForm] = React.useState({ email: "", username: "", password: "", acceptTerms: false });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Track referral / partner link clicks once.
  React.useEffect(() => {
    const code = ref ?? partner;
    if (!code) return;
    const key = `ms.refclick.${code}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
    api("/api/v1/referrals/click", { json: { code } }).catch(() => {});
  }, [ref, partner]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email address";
    if (!USERNAME_REGEX.test(form.username.trim())) e.username = `${LIMITS.USERNAME_MIN}–${LIMITS.USERNAME_MAX} characters: letters, numbers, _ . -`;
    if (form.password.length < LIMITS.PASSWORD_MIN) e.password = `Password must be at least ${LIMITS.PASSWORD_MIN} characters`;
    if (!form.acceptTerms) e.acceptTerms = "You must accept the Terms and Privacy Policy";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const data = await api<{ redirect: string }>("/api/v1/auth/register", { json: { email: form.email.trim(), username: form.username.trim(), password: form.password, acceptTerms: true, ref, partner } });
      router.push(data.redirect || "/app?welcome=1");
      router.refresh();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      if (err instanceof ApiClientError && (err.code === "EMAIL_TAKEN" || err.code === "USERNAME_TAKEN")) { /* shown inline */ }
      else setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <AuthHeading title="Create your account" description={<span className="inline-flex items-center gap-1.5 text-accent"><Sparkles className="h-3.5 w-3.5" aria-hidden /> 150 free credits · no card required</span>} />
      {ref || partner ? <p className="mb-4 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-xs text-accent">{partner ? "Partner code applied — any partner bonus is added after sign-up." : "Referral applied — your friend gets rewarded after your first successful build."}</p> : null}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <input type="hidden" name="ref" value={ref ?? ""} />
        <input type="hidden" name="partner" value={partner ?? ""} />
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" required value={form.email} invalid={!!errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Username" htmlFor="username" error={errors.username} hint="3–24 characters. Letters, numbers, _ . and - only.">
          <Input id="username" autoComplete="username" required minLength={LIMITS.USERNAME_MIN} maxLength={LIMITS.USERNAME_MAX} value={form.username} invalid={!!errors.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password}>
          <div className="relative">
            <Input id="password" type={showPw ? "text" : "password"} autoComplete="new-password" required minLength={LIMITS.PASSWORD_MIN} className="pr-10" value={form.password} invalid={!!errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" className="absolute inset-y-0 right-0 px-3 text-fg-subtle hover:text-fg" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"}>{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <PasswordHints password={form.password} />
        </Field>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <Checkbox id="terms" checked={form.acceptTerms} onCheckedChange={(v) => setForm({ ...form, acceptTerms: v === true })} aria-invalid={!!errors.acceptTerms} className="mt-0.5" />
            <Label htmlFor="terms" className="leading-5 font-normal text-fg-muted">I agree to the <Link href="/terms" className="text-accent hover:underline">Terms</Link> and <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>.</Label>
          </div>
          {errors.acceptTerms ? <p className="text-xs text-danger" role="alert">{errors.acceptTerms}</p> : null}
        </div>
        <FormError message={error} />
        <Button type="submit" className="w-full" loading={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-fg-muted">Already have an account? <Link href="/login" className="font-medium text-accent hover:underline">Log in</Link></p>
    </>
  );
}
