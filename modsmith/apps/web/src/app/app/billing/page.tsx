import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Server, Sparkles } from "lucide-react";
import { prisma } from "@modsmith/db";
import { stripeConfigured } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { formatCredits, formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { PortalButton, SubscriptionToggle } from "@/components/app/billing/billing-actions";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ACTIVE_STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE"] as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const success = first(sp.status) === "success";
  const purchaseId = first(sp.purchase);
  const subscriptionId = first(sp.subscription);
  const configured = stripeConfigured();

  const [account, purchases, subscriptions] = await Promise.all([
    prisma.creditAccount.findUnique({ where: { userId: user.id }, select: { balance: true } }),
    prisma.creditPurchase.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50, include: { pack: { select: { name: true } } } }),
    prisma.subscription.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { plan: true } }),
  ]);
  const active = subscriptions.filter((s) => ACTIVE_STATUSES.includes(s.status as (typeof ACTIVE_STATUSES)[number]));
  const creator = active.find((s) => s.plan.kind === "CREATOR") ?? null;
  const hub = active.find((s) => s.plan.kind === "SERVER_HUB") ?? null;

  const planCard = (kind: "CREATOR" | "SERVER_HUB", sub: typeof creator) => {
    const isCreator = kind === "CREATOR";
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">{isCreator ? <Sparkles className="h-4 w-4 text-accent" aria-hidden /> : <Server className="h-4 w-4 text-accent" aria-hidden />}{isCreator ? "Creator plan" : "Server Hub plan"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sub ? (
            <>
              <div className="flex flex-wrap items-center gap-2"><span className="text-lg font-semibold">{sub.plan.name}</span><StatusBadge status={sub.status} /><Badge variant="default">{sub.interval === "year" ? "yearly" : "monthly"}</Badge>{sub.cancelAtPeriodEnd ? <Badge variant="warning">cancels at period end</Badge> : null}</div>
              <dl className="divide-y divide-border text-sm">
                <div className="flex justify-between py-2"><dt className="text-fg-muted">{sub.cancelAtPeriodEnd ? "Access ends" : "Next billing date"}</dt><dd className="font-medium">{sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : "—"}</dd></div>
                {isCreator && sub.plan.monthlyCredits ? <div className="flex justify-between py-2"><dt className="text-fg-muted">Monthly credits</dt><dd className="font-medium tabular-nums">{formatCredits(sub.plan.monthlyCredits)}</dd></div> : null}
                {isCreator && sub.plan.exportDiscountPct ? <div className="flex justify-between py-2"><dt className="text-fg-muted">Export discount</dt><dd className="font-medium">{sub.plan.exportDiscountPct}%</dd></div> : null}
                {!isCreator && sub.plan.hubMaxServers ? <div className="flex justify-between py-2"><dt className="text-fg-muted">Servers included</dt><dd className="font-medium">{sub.plan.hubMaxServers}</dd></div> : null}
                {!isCreator && sub.plan.hubRetentionDays ? <div className="flex justify-between py-2"><dt className="text-fg-muted">Log retention</dt><dd className="font-medium">{sub.plan.hubRetentionDays} days</dd></div> : null}
              </dl>
              {sub.status === "PAST_DUE" ? <Alert variant="warning" title="Payment failed">Update your payment method in the Stripe portal to keep your plan active.</Alert> : null}
              <div className="flex flex-wrap gap-2"><SubscriptionToggle subscriptionId={sub.id} planName={sub.plan.name} cancelAtPeriodEnd={sub.cancelAtPeriodEnd} periodEnd={sub.currentPeriodEnd?.toISOString() ?? null} disabled={!configured || !sub.stripeSubscriptionId} /><PortalButton disabled={!configured} /></div>
            </>
          ) : (
            <>
              <p className="text-sm text-fg-muted">{isCreator ? "You are on the free plan. A creator plan adds monthly credits, export discounts and premium tools." : "The free tier includes one server with basic storage and retention. Upgrade for more servers, storage and longer retention."}</p>
              <Button size="sm" asChild><Link href="/pricing">See plans</Link></Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Billing" description="Plans, payment history and invoices." actions={<PortalButton disabled={!configured} />} />

      {success ? (
        <Alert variant="success" title="Payment received">
          {purchaseId ? "Your credits arrive within a minute after payment confirmation — refresh this page if the balance has not updated yet." : subscriptionId ? "Your subscription is being activated. It appears here within a minute of payment confirmation." : "Thanks! Your purchase is being processed."}
          {" "}Current balance: <strong>{formatCredits(account?.balance)}</strong> credits.
        </Alert>
      ) : null}
      {!configured ? <Alert variant="info" title="Payments are not configured">Checkout, the customer portal and subscription changes are unavailable in this environment.</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-2">{planCard("CREATOR", creator)}{planCard("SERVER_HUB", hub)}</div>

      <section aria-labelledby="purchases">
        <h2 id="purchases" className="mb-3 text-lg font-semibold">Purchase history</h2>
        {purchases.length ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-bg-elevated">
            <table className="w-full text-sm">
              <caption className="sr-only">Credit purchases</caption>
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle"><th scope="col" className="px-3 py-2">Date</th><th scope="col" className="px-3 py-2">Package</th><th scope="col" className="px-3 py-2">Credits</th><th scope="col" className="px-3 py-2">Amount</th><th scope="col" className="px-3 py-2">Status</th><th scope="col" className="px-3 py-2"></th></tr></thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">{formatDateTime(p.paidAt ?? p.createdAt)}</td>
                    <td className="px-3 py-2.5">{p.pack?.name ?? "Custom"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatCredits(p.credits + p.bonusCredits)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatMoney(p.amountCents, p.currency)}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={p.status} /></td>
                    <td className="px-3 py-2.5 text-right">{p.receiptUrl ? <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">Receipt</a> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-sm text-fg-muted">No purchases yet. <Link href="/app/credits" className="text-accent hover:underline">Buy credits</Link></p>}
      </section>

      <section aria-labelledby="subs">
        <h2 id="subs" className="mb-3 text-lg font-semibold">Subscription history</h2>
        {subscriptions.length ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-bg-elevated">
            <table className="w-full text-sm">
              <caption className="sr-only">Subscriptions</caption>
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle"><th scope="col" className="px-3 py-2">Plan</th><th scope="col" className="px-3 py-2">Interval</th><th scope="col" className="px-3 py-2">Started</th><th scope="col" className="px-3 py-2">Ends</th><th scope="col" className="px-3 py-2">Status</th></tr></thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5">{s.plan.name} <span className="text-xs text-fg-subtle">({s.plan.kind === "CREATOR" ? "Creator" : "Server Hub"})</span></td>
                    <td className="px-3 py-2.5">{s.interval === "year" ? "Yearly" : "Monthly"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">{formatDate(s.currentPeriodStart ?? s.createdAt)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">{s.endedAt ? formatDate(s.endedAt) : s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : "—"}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={s.status} />{s.cancelAtPeriodEnd && !s.endedAt ? <Badge variant="warning" className="ml-1">cancels</Badge> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-sm text-fg-muted">No subscriptions yet. <Link href="/pricing" className="text-accent hover:underline">Compare plans</Link></p>}
      </section>

      <p className="flex items-center gap-2 text-xs text-fg-subtle"><CreditCard className="h-3.5 w-3.5" aria-hidden /> Payments, invoices and payment methods are handled by Stripe. Modsmith never stores your card details.</p>
    </div>
  );
}
