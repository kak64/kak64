"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LIMITS, USERNAME_REGEX } from "@modsmith/core";
import { api, ApiClientError, fieldErrors } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "../hooks";

export interface ProfileData { username: string; email: string; bio: string; avatarUrl: string; profilePublic: boolean }

export function ProfileForm({ initial }: { initial: ProfileData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const dirty = form.username !== initial.username || form.email !== initial.email || form.bio !== initial.bio || form.avatarUrl !== initial.avatarUrl;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setErrors({});
    const errs: Record<string, string> = {};
    if (!USERNAME_REGEX.test(form.username.trim())) errs.username = `${LIMITS.USERNAME_MIN}–${LIMITS.USERNAME_MAX} characters: letters, numbers, _ . -`;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = "Enter a valid email address";
    if (form.avatarUrl.trim()) { try { const u = new URL(form.avatarUrl.trim()); if (!/^https?:$/.test(u.protocol)) errs.avatarUrl = "Use an http(s) image URL"; } catch { errs.avatarUrl = "Enter a valid URL"; } }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    try {
      const r = await api<{ username: string; email: string; bio: string | null; avatarUrl: string | null; pendingEmail: string | null }>("/api/v1/users/me", { method: "PATCH", json: { username: form.username.trim(), email: form.email.trim(), bio: form.bio.trim(), avatarUrl: form.avatarUrl.trim() || null } });
      setPendingEmail(r.pendingEmail);
      toast({ title: "Profile saved", description: r.pendingEmail ? `Confirm ${r.pendingEmail} from the verification email to finish the change.` : undefined, variant: "success" });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) { router.push("/login"); return; }
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe); else setError(errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Username" htmlFor="p-username" error={errors.username} hint="Shown on your public profile and showcase items.">
        <Input id="p-username" value={form.username} minLength={LIMITS.USERNAME_MIN} maxLength={LIMITS.USERNAME_MAX} invalid={!!errors.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
      </Field>
      <Field label="Email" htmlFor="p-email" error={errors.email} hint="Changing your email sends a verification link to the new address. The change applies once you confirm it.">
        <Input id="p-email" type="email" value={form.email} invalid={!!errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      {pendingEmail ? <Alert variant="info" title="Confirm your new email">We sent a verification link to {pendingEmail}. Your current email stays active until you confirm.</Alert> : null}
      <Field label="Bio" htmlFor="p-bio" error={errors.bio} hint="Up to 500 characters.">
        <Textarea id="p-bio" value={form.bio} maxLength={500} rows={4} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
      </Field>
      <Field label="Avatar URL" htmlFor="p-avatar" error={errors.avatarUrl} hint="Direct link to an image (https). Leave empty to use your initials.">
        <Input id="p-avatar" type="url" inputMode="url" value={form.avatarUrl} invalid={!!errors.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="https://…" />
      </Field>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} disabled={!dirty}>Save profile</Button>
        {form.profilePublic ? <Link href={`/u/${initial.username}`} className="text-sm text-accent hover:underline">View public profile</Link> : <span className="text-sm text-fg-subtle">Your profile is private — change this in <Link href="/app/settings" className="text-accent hover:underline">Settings → Privacy</Link>.</span>}
      </div>
    </form>
  );
}
