"use client";
import * as React from "react";
import { Coins, Sparkles } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { formatCredits, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "../hooks";

export interface PackCard { id: string; slug: string; name: string; credits: number; bonusCredits: number; priceCents: number; currency: string; badge: string | null; isCustom: boolean; minCredits: number | null; maxCredits: number | null }

export function BuyCredits({ packs, stripeConfigured }: { packs: PackCard[]; stripeConfigured: boolean }) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [custom, setCustom] = React.useState<Record<string, string>>({});

  const checkout = async (pack: PackCard) => {
    setBusy(pack.id);
    try {
      const quantity = pack.isCustom ? Number(custom[pack.id] ?? pack.minCredits ?? 100) : undefined;
      const r = await api<{ url: string }>("/api/v1/billing/checkout/pack", { json: { packId: pack.id, ...(quantity ? { quantity } : {}) } });
      window.location.href = r.url;
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "PAYMENT_ERROR") toast({ title: "Payment could not be started", description: err.message, variant: "danger" });
      else toast({ title: "Checkout failed", description: errorMessage(err), variant: "danger" });
      setBusy(null);
    }
  };

  if (!packs.length) return <Alert variant="info">Credit packs are not available right now. Check back soon.</Alert>;
  return (
    <div className="space-y-3">
      {!stripeConfigured ? <Alert variant="info" title="Payments are not configured">Checkout is unavailable in this environment.</Alert> : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {packs.map((p) => {
          const total = p.credits + p.bonusCredits;
          const perCredit = p.isCustom ? p.priceCents : p.priceCents / total;
          return (
            <li key={p.id} className="flex flex-col rounded-lg border border-border bg-bg-elevated p-4">
              <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{p.name}</h3>{p.badge ? <Badge variant="accent"><Sparkles className="h-3 w-3" aria-hidden /> {p.badge}</Badge> : null}</div>
              {p.isCustom ? (
                <div className="mt-3">
                  <label className="text-xs text-fg-muted" htmlFor={`custom-${p.id}`}>Credits ({formatCredits(p.minCredits ?? 1)}–{formatCredits(p.maxCredits ?? 1000000)})</label>
                  <Input id={`custom-${p.id}`} type="number" min={p.minCredits ?? 1} max={p.maxCredits ?? 1000000} step={10} value={custom[p.id] ?? String(p.minCredits ?? 100)} onChange={(e) => setCustom({ ...custom, [p.id]: e.target.value })} className="mt-1" />
                  <p className="mt-2 text-sm font-semibold tabular-nums">{formatMoney(Number(custom[p.id] ?? p.minCredits ?? 100) * p.priceCents, p.currency)}</p>
                </div>
              ) : (
                <>
                  <p className="mt-3 flex items-baseline gap-1 text-2xl font-semibold tabular-nums"><Coins className="h-5 w-5 text-accent" aria-hidden />{formatCredits(total)}</p>
                  {p.bonusCredits ? <p className="text-xs text-success">includes {formatCredits(p.bonusCredits)} bonus credits</p> : null}
                  <p className="mt-2 text-lg font-semibold tabular-nums">{formatMoney(p.priceCents, p.currency)}</p>
                  <p className="text-xs text-fg-subtle">{formatMoney(Math.round(perCredit * 100) / 100, p.currency)} per 100 credits</p>
                </>
              )}
              <Button className="mt-auto w-full" size="sm" disabled={!stripeConfigured} loading={busy === p.id} onClick={() => checkout(p)}>Buy credits</Button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-subtle">Secure payment via Stripe. Credits never expire and are added as soon as the payment is confirmed.</p>
    </div>
  );
}
