"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle, Clock } from "lucide-react";
import { CREDITS } from "@modsmith/core";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/hooks/use-me";
import { errorMessage } from "@/components/app/hooks";
import { AuthHeading } from "./auth-heading";

type State = "verifying" | "verified" | "already" | "invalid" | "expired" | "error";

export function VerifyClient() {
  const params = useSearchParams();
  const token = params.get("token");
  const { me, refresh } = useMe();
  const { toast } = useToast();
  const [state, setState] = React.useState<State>(token ? "verifying" : "invalid");
  const [message, setMessage] = React.useState<string | null>(null);
  const [resending, setResending] = React.useState(false);
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api<{ verified: boolean; alreadyVerified: boolean }>("/api/v1/auth/verify", { json: { token } })
      .then((r) => { setState(r.alreadyVerified ? "already" : "verified"); refresh().catch(() => {}); })
      .catch((err) => {
        if (err instanceof ApiClientError && err.code === "TOKEN_EXPIRED") setState("expired");
        else if (err instanceof ApiClientError && err.code === "TOKEN_INVALID") setState("invalid");
        else { setState("error"); setMessage(errorMessage(err)); }
      });
  }, [token, refresh]);

  const resend = async () => {
    setResending(true);
    try { await api("/api/v1/auth/verify/resend", { method: "POST" }); toast({ title: "Verification email sent", variant: "success" }); }
    catch (err) { toast({ title: "Could not resend", description: errorMessage(err), variant: "danger" }); }
    finally { setResending(false); }
  };

  if (state === "verifying") return (<div className="flex flex-col items-center py-6 text-center" aria-live="polite"><Loader2 className="mb-3 h-8 w-8 animate-spin text-accent" aria-hidden /><h1 className="text-lg font-semibold">Verifying your email…</h1><p className="mt-1 text-sm text-fg-muted">This only takes a second.</p></div>);
  if (state === "verified" || state === "already") return (
    <div className="flex flex-col items-center text-center">
      <CheckCircle2 className="mb-3 h-10 w-10 text-success" aria-hidden />
      <AuthHeading title={state === "already" ? "Email already verified" : "Email verified"} description={state === "already" ? "Your account is all set." : `${CREDITS.EMAIL_VERIFY_BONUS} bonus credits added to your account. All tools are now unlocked.`} />
      <Button className="w-full" asChild><Link href={me?.user ? "/app" : "/login?next=/app"}>{me?.user ? "Go to your workshop" : "Log in to continue"}</Link></Button>
    </div>
  );
  const expired = state === "expired";
  return (
    <div className="flex flex-col items-center text-center">
      {expired ? <Clock className="mb-3 h-10 w-10 text-warning" aria-hidden /> : <XCircle className="mb-3 h-10 w-10 text-danger" aria-hidden />}
      <AuthHeading title={expired ? "This link has expired" : state === "error" ? "Verification failed" : "This link is invalid"} description={expired ? "Verification links are valid for 24 hours. Request a fresh one below." : message ?? "This verification link is invalid or was already used."} />
      {me?.user ? (
        me.user.emailVerified ? <Button className="w-full" asChild><Link href="/app">Go to your workshop</Link></Button>
          : <Button className="w-full" loading={resending} onClick={resend}>Resend verification email</Button>
      ) : (
        <Button className="w-full" asChild><Link href="/login?next=/app/profile">Log in to resend</Link></Button>
      )}
    </div>
  );
}
