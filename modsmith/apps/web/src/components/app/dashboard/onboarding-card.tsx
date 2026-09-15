"use client";
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, MailCheck, MessageCircle, Box, Gift } from "lucide-react";
import { CREDITS } from "@modsmith/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const KEY = "ms.onboardingDismissed";

export function OnboardingCard({ username, emailVerified, discordConnected, hasCreation, forceShow }: { username: string; emailVerified: boolean; discordConnected: boolean; hasCreation: boolean; forceShow: boolean }) {
  const [hidden, setHidden] = React.useState(!forceShow);
  React.useEffect(() => { try { if (sessionStorage.getItem(KEY) === "1" && !forceShow) setHidden(true); else if (forceShow) setHidden(false); } catch { /* ignore */ } }, [forceShow]);
  if (hidden) return null;
  const steps = [
    { done: emailVerified, icon: MailCheck, label: "Verify your email", hint: `+${CREDITS.EMAIL_VERIFY_BONUS} credits`, href: "/app/profile" },
    { done: discordConnected, icon: MessageCircle, label: "Connect Discord", hint: `+${CREDITS.DISCORD_BONUS} credits and job notifications`, href: "/app/profile" },
    { done: hasCreation, icon: Box, label: "Try the Prop Creator", hint: "Turn any model into a FiveM prop", href: "/app/tools/prop-creator" },
    { done: false, icon: Gift, label: "Invite friends", hint: `Earn ${CREDITS.REFERRAL_REWARD} credits per referral`, href: "/app/referrals" },
  ];
  return (
    <section aria-labelledby="onboarding-title" className="relative rounded-lg border border-accent/30 bg-accent-soft/40 p-5">
      <button type="button" className="absolute right-3 top-3 rounded p-1 text-fg-muted hover:text-fg" aria-label="Dismiss" onClick={() => { try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ } setHidden(true); }}><X className="h-4 w-4" /></button>
      <h2 id="onboarding-title" className="text-lg font-semibold">Welcome to Modsmith, {username}!</h2>
      <p className="mt-1 text-sm text-fg-muted">Your {CREDITS.SIGNUP_BONUS} free credits are ready. Here's how to get the most out of your workshop:</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className={cn("flex items-start gap-3 rounded-md border border-border bg-bg-elevated p-3 transition-colors hover:border-accent/50", s.done && "opacity-70")}>
              {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />}
              <div><div className={cn("text-sm font-medium", s.done && "line-through")}>{s.label}</div><div className="text-xs text-fg-muted">{s.hint}</div></div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4"><Button size="sm" asChild><Link href="/app/tools">Browse all tools</Link></Button></div>
    </section>
  );
}
