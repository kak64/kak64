"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Infinity as InfinityIcon, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/api-client";
import { cn, formatMoney } from "@/lib/utils";

export type PricingPack = { id: string; slug: string; name: string; credits: number; bonusCredits: number; priceCents: number; currency: string; isCustom: boolean; minCredits: number | null; maxCredits: number | null; badge: string | null };
export type PricingPlan = { id: string; slug: string; kind: "CREATOR" | "SERVER_HUB"; name: string; description: string | null; monthlyPriceCents: number; yearlyPriceCents: number; currency: string; monthlyCredits: number; exportDiscountPct: number; premiumTools: boolean; aiTools: boolean; faceDailyExports: number | null; hubStorageGb: number | null; hubRetentionDays: number | null; hubMaxServers: number | null; features: string[] };
export type Interval = "month" | "year";

export function savingsPct(p: Pick<PricingPlan, "monthlyPriceCents" | "yearlyPriceCents">) {
  const full = p.monthlyPriceCents * 12;
  if (!full || p.yearlyPriceCents >= full) return 0;
  return Math.round(((full - p.yearlyPriceCents) / full) * 100);
}

/* ───────────── Checkout ───────────── */

type Checkout = { kind: "pack"; packId: string; quantity?: number } | { kind: "subscription"; planId: string; interval: Interval };

export function CheckoutButton({ loggedIn, checkout, children, className, variant = "default", size = "default", disabled }: { loggedIn: boolean; checkout: Checkout; children: React.ReactNode; className?: string; variant?: "default" | "secondary" | "outline"; size?: "default" | "sm" | "lg"; disabled?: boolean }) {
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();
  if (!loggedIn) {
    return <Button asChild variant={variant} size={size} className={className}><Link href="/register">{children}</Link></Button>;
  }
  const run = async () => {
    setLoading(true);
    try {
      const res = checkout.kind === "pack"
        ? await api<{ url: string }>("/api/v1/billing/checkout/pack", { json: { packId: checkout.packId, ...(checkout.quantity ? { quantity: checkout.quantity } : {}) } })
        : await api<{ url: string }>("/api/v1/billing/checkout/subscription", { json: { planId: checkout.planId, interval: checkout.interval } });
      if (res?.url) { window.location.assign(res.url); return; }
      toast({ title: "Checkout could not be started", description: "No checkout URL was returned. Please try again.", variant: "danger" });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) { router.push(`/login?next=${encodeURIComponent("/pricing")}`); return; }
      toast({ title: "Checkout unavailable", description: err instanceof Error ? err.message : "Something went wrong.", variant: "danger" });
    } finally {
      setLoading(false);
    }
  };
  return <Button variant={variant} size={size} className={className} onClick={run} loading={loading} disabled={disabled}>{children}</Button>;
}

/* ───────────── Interval toggle ───────────── */

export function IntervalToggle({ value, onChange, maxSavings }: { value: Interval; onChange: (v: Interval) => void; maxSavings: number }) {
  return (
    <div role="radiogroup" aria-label="Billing interval" className="inline-flex items-center rounded-md border border-border bg-bg-muted p-1 text-sm">
      {(["month", "year"] as const).map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          onClick={() => onChange(i)}
          className={cn("cursor-pointer rounded-sm px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent", value === i ? "bg-bg-elevated text-fg shadow" : "text-fg-muted hover:text-fg")}
        >
          {i === "month" ? "Monthly" : "Yearly"}
          {i === "year" && maxSavings > 0 ? <span className="ml-1.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">save up to {maxSavings}%</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ───────────── Plans ───────────── */

export function PlanCard({ plan, interval, loggedIn, highlight }: { plan: PricingPlan; interval: Interval; loggedIn: boolean; highlight?: boolean }) {
  const cents = interval === "month" ? plan.monthlyPriceCents : plan.yearlyPriceCents;
  const perMonth = interval === "month" ? cents : Math.round(cents / 12);
  const save = savingsPct(plan);
  const features = plan.features.length ? plan.features : [
    plan.monthlyCredits ? `${plan.monthlyCredits.toLocaleString("en-US")} credits every month` : null,
    plan.exportDiscountPct ? `${plan.exportDiscountPct}% off every export` : null,
    plan.aiTools ? "AI tools included" : null,
    plan.faceDailyExports ? `${plan.faceDailyExports} free face exports / day` : null,
    plan.hubStorageGb ? `${plan.hubStorageGb} GB private media` : null,
    plan.hubRetentionDays ? `${plan.hubRetentionDays}-day log retention` : null,
    plan.hubMaxServers ? `${plan.hubMaxServers} servers` : null,
  ].filter((x): x is string => !!x);
  return (
    <article className={cn("flex h-full flex-col rounded-lg border bg-bg-elevated p-6", highlight ? "glow-ring border-accent/50" : "border-border")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-fg">{plan.name}</h3>
        {highlight ? <Badge variant="accent">Popular</Badge> : null}
      </div>
      {plan.description ? <p className="mt-1 text-sm text-fg-muted">{plan.description}</p> : null}
      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums text-fg">{formatMoney(perMonth, plan.currency)}</span>
        <span className="text-sm text-fg-muted">/ month</span>
      </div>
      <p className="mt-1 h-5 text-xs text-fg-subtle">
        {interval === "year" ? `${formatMoney(cents, plan.currency)} billed yearly${save ? ` · save ${save}%` : ""}` : "Billed monthly · cancel anytime"}
      </p>
      <ul className="mt-5 flex-1 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-fg"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> {f}</li>
        ))}
      </ul>
      <CheckoutButton loggedIn={loggedIn} checkout={{ kind: "subscription", planId: plan.id, interval }} className="mt-6 w-full" variant={highlight ? "default" : "secondary"}>
        {loggedIn ? `Subscribe to ${plan.name}` : "Create free account"}
      </CheckoutButton>
    </article>
  );
}

export function PlanGrid({ plans, loggedIn, interval, onIntervalChange, title, description }: { plans: PricingPlan[]; loggedIn: boolean; interval: Interval; onIntervalChange?: (v: Interval) => void; title?: string; description?: string }) {
  const maxSavings = Math.max(0, ...plans.map(savingsPct));
  const highlightIdx = plans.length > 1 ? 0 : -1;
  return (
    <div>
      {(title || onIntervalChange) ? (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {title ? <h3 className="text-lg font-semibold text-fg">{title}</h3> : null}
            {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
          </div>
          {onIntervalChange ? <IntervalToggle value={interval} onChange={onIntervalChange} maxSavings={maxSavings} /> : null}
        </div>
      ) : null}
      <div className={cn("grid gap-4", plans.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {plans.map((p, i) => <PlanCard key={p.id} plan={p} interval={interval} loggedIn={loggedIn} highlight={i === highlightIdx} />)}
      </div>
    </div>
  );
}

/* ───────────── Packs ───────────── */

export function PackCard({ pack, loggedIn }: { pack: PricingPack; loggedIn: boolean }) {
  const total = pack.credits + pack.bonusCredits;
  const perCredit = pack.priceCents / Math.max(1, total);
  return (
    <article className={cn("flex h-full flex-col rounded-lg border bg-bg-elevated p-5", pack.badge ? "border-accent/40" : "border-border")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{pack.name}</h3>
        {pack.badge ? <Badge variant="accent">{pack.badge}</Badge> : null}
      </div>
      <div className="mt-4 text-2xl font-semibold tabular-nums text-fg">{formatMoney(pack.priceCents, pack.currency)}</div>
      <p className="mt-1 text-sm text-fg">
        <span className="tabular-nums">{pack.credits.toLocaleString("en-US")}</span> credits
        {pack.bonusCredits ? <span className="text-success"> + {pack.bonusCredits.toLocaleString("en-US")} bonus</span> : null}
      </p>
      <p className="mt-0.5 text-xs text-fg-subtle">≈ {(perCredit).toFixed(2)}¢ per credit</p>
      <CheckoutButton loggedIn={loggedIn} checkout={{ kind: "pack", packId: pack.id }} className="mt-5 w-full" variant="secondary" size="sm">
        {loggedIn ? "Buy credits" : "Create free account"}
      </CheckoutButton>
    </article>
  );
}

export function CustomPackCard({ pack, loggedIn }: { pack: PricingPack; loggedIn: boolean }) {
  const min = pack.minCredits ?? 100;
  const max = pack.maxCredits ?? 100_000;
  const [qty, setQty] = React.useState(Math.max(min, 1000));
  const clamped = Math.min(max, Math.max(min, Math.floor(qty) || min));
  const total = clamped * pack.priceCents;
  return (
    <article className="flex h-full flex-col rounded-lg border border-dashed border-border-strong bg-bg-elevated p-5">
      <h3 className="text-sm font-semibold text-fg">{pack.name}</h3>
      <p className="mt-1 text-xs text-fg-muted">{formatMoney(pack.priceCents, pack.currency)} per credit · {min.toLocaleString("en-US")}–{max.toLocaleString("en-US")} credits</p>
      <div className="mt-4">
        <Label htmlFor={`qty-${pack.id}`} className="text-xs text-fg-muted">Credits</Label>
        <Input id={`qty-${pack.id}`} type="number" inputMode="numeric" min={min} max={max} step={50} value={qty} onChange={(e) => setQty(Number(e.target.value))} onBlur={() => setQty(clamped)} className="mt-1 tabular-nums" aria-describedby={`qty-${pack.id}-total`} />
      </div>
      <div id={`qty-${pack.id}-total`} className="mt-3 text-2xl font-semibold tabular-nums text-fg" aria-live="polite">{formatMoney(total, pack.currency)}</div>
      <CheckoutButton loggedIn={loggedIn} checkout={{ kind: "pack", packId: pack.id, quantity: clamped }} className="mt-5 w-full" variant="secondary" size="sm">
        {loggedIn ? `Buy ${clamped.toLocaleString("en-US")} credits` : "Create free account"}
      </CheckoutButton>
    </article>
  );
}

export function PackGrid({ packs, loggedIn }: { packs: PricingPack[]; loggedIn: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {packs.map((p) => (p.isCustom ? <CustomPackCard key={p.id} pack={p} loggedIn={loggedIn} /> : <PackCard key={p.id} pack={p} loggedIn={loggedIn} />))}
    </div>
  );
}

export function CreditGuarantees({ reexportDays }: { reexportDays: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-bg-elevated p-4">
        <InfinityIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
        <div>
          <div className="text-sm font-semibold text-fg">Credits never expire</div>
          <p className="mt-0.5 text-xs leading-5 text-fg-muted">Buy once, use whenever. Failed builds are refunded automatically.</p>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-bg-elevated p-4">
        <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
        <div>
          <div className="text-sm font-semibold text-fg">Free re-exports for {reexportDays} days</div>
          <p className="mt-0.5 text-xs leading-5 text-fg-muted">Same file, same settings re-exported within {reexportDays} days = free.</p>
        </div>
      </div>
    </div>
  );
}

/** Homepage pricing preview: packs + plans with a shared interval toggle. */
export function PricingPreview({ packs, plans, loggedIn, reexportDays }: { packs: PricingPack[]; plans: PricingPlan[]; loggedIn: boolean; reexportDays: number }) {
  const [interval, setInterval] = React.useState<Interval>("month");
  const creator = plans.filter((p) => p.kind === "CREATOR");
  return (
    <div className="space-y-10">
      <div>
        <h3 className="mb-4 text-lg font-semibold text-fg">Credit packs</h3>
        <PackGrid packs={packs} loggedIn={loggedIn} />
      </div>
      {creator.length ? <PlanGrid plans={creator} loggedIn={loggedIn} interval={interval} onIntervalChange={setInterval} title="Creator subscriptions" description="Monthly credits plus a discount on every export." /> : null}
      <CreditGuarantees reexportDays={reexportDays} />
    </div>
  );
}

/** Full pricing page body: interval state shared between creator and server hub plans. */
export function PricingPlansSection({ plans, loggedIn }: { plans: PricingPlan[]; loggedIn: boolean }) {
  const [interval, setInterval] = React.useState<Interval>("month");
  const creator = plans.filter((p) => p.kind === "CREATOR");
  const hub = plans.filter((p) => p.kind === "SERVER_HUB");
  return (
    <div className="space-y-14">
      {creator.length ? <div id="subscriptions" className="scroll-mt-24"><PlanGrid plans={creator} loggedIn={loggedIn} interval={interval} onIntervalChange={setInterval} title="Creator subscriptions" description="For creators exporting every week: monthly credits, export discounts and AI tools." /></div> : null}
      {hub.length ? <div id="server-hub" className="scroll-mt-24"><PlanGrid plans={hub} loggedIn={loggedIn} interval={interval} onIntervalChange={creator.length ? undefined : setInterval} title="Server Hub plans" description="Logs, screenshots and phone media for your FiveM server. The free tier includes 512 MB of private media and 14-day log retention." /></div> : null}
    </div>
  );
}
