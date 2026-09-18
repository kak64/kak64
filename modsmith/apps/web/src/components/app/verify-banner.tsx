"use client";
import * as React from "react";
import { MailWarning, X } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { errorMessage, retryAfterSeconds } from "./hooks";

const KEY = "ms.verifyBannerDismissed";

export function VerifyEmailBanner() {
  const { toast } = useToast();
  const [hidden, setHidden] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  React.useEffect(() => { try { setHidden(sessionStorage.getItem(KEY) === "1"); } catch { setHidden(false); } }, []);
  React.useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  if (hidden) return null;

  const resend = async () => {
    setSending(true);
    try {
      await api("/api/v1/auth/verify/resend", { method: "POST" });
      toast({ title: "Verification email sent", description: "Check your inbox (and spam folder).", variant: "success" });
      setCooldown(60);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "CONFLICT") { toast({ title: "Already verified", description: "Reload the page to update your account." }); setHidden(true); return; }
      const secs = retryAfterSeconds(err);
      if (secs) setCooldown(secs);
      toast({ title: "Could not resend", description: errorMessage(err), variant: "danger" });
    } finally { setSending(false); }
  };

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning sm:px-6">
      <MailWarning className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">Verify your email to unlock bonus credits and all tools.</span>
      <Button size="sm" variant="outline" className="border-warning/40 text-warning hover:bg-warning/10" loading={sending} disabled={cooldown > 0} onClick={resend}>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}</Button>
      <button type="button" className="rounded p-1 text-warning/80 hover:text-warning" aria-label="Dismiss" onClick={() => { try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ } setHidden(true); }}><X className="h-4 w-4" /></button>
    </div>
  );
}
