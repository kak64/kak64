"use client";
import * as React from "react";
import Link from "next/link";
import { ApiClientError, api } from "@/lib/api-client";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "./hooks";

/** Renders an API error inline with a clear message and a CTA for gated states. */
export function ApiErrorAlert({ error, className }: { error: unknown; className?: string }) {
  const { toast } = useToast();
  const [resending, setResending] = React.useState(false);
  if (!error) return null;
  const code = error instanceof ApiClientError ? error.code : "";
  const details = error instanceof ApiClientError ? (error.details as Record<string, unknown> | undefined) : undefined;
  const msg = errorMessage(error);

  if (code === "INSUFFICIENT_CREDITS") {
    return (
      <Alert variant="warning" title="Not enough credits" className={className}>
        <p>{msg}</p>
        <div className="mt-2 flex gap-2"><Button size="sm" asChild><Link href="/app/credits">Buy credits</Link></Button></div>
      </Alert>
    );
  }
  if (code === "SUBSCRIPTION_REQUIRED") {
    return (
      <Alert variant="warning" title="Subscription required" className={className}>
        <p>{msg}</p>
        <div className="mt-2 flex gap-2"><Button size="sm" asChild><Link href="/pricing">See plans</Link></Button><Button size="sm" variant="outline" asChild><Link href="/app/billing">Billing</Link></Button></div>
      </Alert>
    );
  }
  if (code === "EMAIL_NOT_VERIFIED") {
    return (
      <Alert variant="warning" title="Verify your email to continue" className={className}>
        <p>This action needs a verified email address. Check your inbox for the verification link.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" loading={resending} onClick={async () => { setResending(true); try { await api("/api/v1/auth/verify/resend", { method: "POST" }); toast({ title: "Verification email sent", variant: "success" }); } catch (e) { toast({ title: "Could not resend", description: errorMessage(e), variant: "danger" }); } finally { setResending(false); } }}>Resend verification</Button>
          <Button size="sm" variant="outline" asChild><Link href="/app/profile">Profile</Link></Button>
        </div>
      </Alert>
    );
  }
  if (code === "DISCORD_NOT_CONNECTED") {
    return (
      <Alert variant="warning" title="Connect Discord" className={className}>
        <p>{msg}</p>
        <div className="mt-2 flex gap-2"><Button size="sm" asChild><Link href="/app/profile">Connect Discord</Link></Button></div>
      </Alert>
    );
  }
  if (code === "VALIDATION_ERROR" && details && typeof details === "object") {
    const entries = Object.entries(details).filter(([, v]) => typeof v === "string");
    return (
      <Alert variant="danger" title={msg} className={className}>
        {entries.length ? <ul className="mt-1 list-disc pl-5">{entries.map(([k, v]) => <li key={k}>{k === "_" ? "" : `${k}: `}{String(v)}</li>)}</ul> : null}
      </Alert>
    );
  }
  return <Alert variant="danger" className={className}>{msg}</Alert>;
}
