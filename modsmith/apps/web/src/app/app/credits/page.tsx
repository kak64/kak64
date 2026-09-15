import type { Metadata } from "next";
import Link from "next/link";
import { Coins, TrendingDown, TrendingUp } from "lucide-react";
import { prisma, type Prisma, type CreditTransactionType } from "@modsmith/db";
import { CREDITS } from "@modsmith/core";
import { getEffectiveTools, stripeConfigured } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { cn, formatCredits, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Pagination, Stat } from "@/components/ui/misc";
import { BuyCredits, type PackCard } from "@/components/app/credits/buy-credits";
import { LedgerFilter } from "@/components/app/credits/ledger-filter";
import { isLedgerType } from "@/components/app/credits/ledger-types";

export const metadata: Metadata = { title: "Credits" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function referenceHref(t: { referenceType: string | null; referenceId: string | null }) {
  if (!t.referenceId) return null;
  if (t.referenceType === "job") return `/app/jobs/${t.referenceId}`;
  if (t.referenceType === "purchase") return "/app/billing";
  if (t.referenceType === "referral") return "/app/referrals";
  if (t.referenceType === "subscription") return "/app/billing";
  return null;
}

export default async function CreditsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const typeParam = first(sp.type);
  const type = isLedgerType(typeParam) ? (typeParam as CreditTransactionType) : undefined;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const where: Prisma.CreditTransactionWhereInput = { userId: user.id, ...(type ? { type } : {}) };
  const [account, total, transactions, packs, tools] = await Promise.all([
    prisma.creditAccount.findUnique({ where: { userId: user.id } }),
    prisma.creditTransaction.count({ where }),
    prisma.creditTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.creditPack.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getEffectiveTools(),
  ]);
  const packCards: PackCard[] = packs.map((p) => ({ id: p.id, slug: p.slug, name: p.name, credits: p.credits, bonusCredits: p.bonusCredits, priceCents: p.priceCents, currency: p.currency, badge: p.badge, isCustom: p.isCustom, minCredits: p.minCredits, maxCredits: p.maxCredits }));
  const hrefFor = (p: number) => { const q = new URLSearchParams(); if (type) q.set("type", type); if (p > 1) q.set("page", String(p)); const s = q.toString(); return s ? `/app/credits?${s}` : "/app/credits"; };

  return (
    <div className="space-y-8">
      <PageHeader title="Credits" description="Credits pay for exports. They are charged only when a build succeeds." />

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Current balance" value={formatCredits(account?.balance)} icon={Coins} hint="Never expires" />
        <Stat label="Lifetime earned" value={formatCredits(account?.lifetimeEarned)} icon={TrendingUp} hint="Bonuses, purchases and refunds" />
        <Stat label="Lifetime spent" value={formatCredits(account?.lifetimeSpent)} icon={TrendingDown} hint="Successful exports" />
      </section>

      <section aria-labelledby="buy-credits">
        <h2 id="buy-credits" className="mb-3 text-lg font-semibold">Buy credits</h2>
        <BuyCredits packs={packCards} stripeConfigured={stripeConfigured()} />
      </section>

      <section aria-labelledby="ledger">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="ledger" className="text-lg font-semibold">Transaction history</h2>
          <LedgerFilter type={type ?? ""} />
        </div>
        {transactions.length ? (
          <>
            <div className="overflow-x-auto rounded-lg border border-border bg-bg-elevated">
              <table className="w-full text-sm">
                <caption className="sr-only">Your credit transactions</caption>
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle"><th scope="col" className="px-3 py-2">Type</th><th scope="col" className="px-3 py-2">Amount</th><th scope="col" className="px-3 py-2">Balance</th><th scope="col" className="px-3 py-2">Reason</th><th scope="col" className="px-3 py-2">Date</th></tr></thead>
                <tbody>
                  {transactions.map((t) => {
                    const href = referenceHref(t);
                    return (
                      <tr key={t.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2.5"><Badge variant={t.amount >= 0 ? "success" : "default"}>{t.type.replace(/_/g, " ").toLowerCase()}</Badge></td>
                        <td className={cn("px-3 py-2.5 font-medium tabular-nums", t.amount >= 0 ? "text-success" : "text-fg")}>{t.amount >= 0 ? "+" : ""}{formatCredits(t.amount)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-fg-muted">{formatCredits(t.balanceBefore)} → <span className="text-fg">{formatCredits(t.balanceAfter)}</span></td>
                        <td className="px-3 py-2.5">{href ? <Link href={href} className="hover:text-accent">{t.reason}</Link> : t.reason}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">{formatDateTime(t.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={hrefFor} />
          </>
        ) : <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-sm text-fg-muted">{type ? "No transactions of this type." : "No transactions yet. Your signup bonus and every export will appear here."}</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>What tools cost</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle"><th scope="col" className="py-2 pr-3">Tool</th><th scope="col" className="py-2">Credits / export</th></tr></thead>
                <tbody>{tools.filter((t) => t.enabled).map((t) => <tr key={t.slug} className="border-b border-border last:border-0"><td className="py-2 pr-3"><Link href={t.href} className="hover:text-accent">{t.name}</Link></td><td className="py-2 tabular-nums">{t.creditCost === 0 ? <span className="text-success">Free</span> : formatCredits(t.creditCost)}{t.freeDailyExports ? <span className="ml-2 text-xs text-success">{t.freeDailyExports} free/day</span> : null}</td></tr>)}</tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>How credits work</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-fg-muted">
              <li>• Credits are <strong className="text-fg">held</strong> when a job starts and only <strong className="text-fg">charged on a successful build</strong>.</li>
              <li>• If a build fails or is cancelled, held credits are <strong className="text-fg">refunded automatically</strong> — you will see a refund entry in the ledger.</li>
              <li>• Re-exporting an unchanged file with the same settings is <strong className="text-fg">free for {CREDITS.REEXPORT_WINDOW_DAYS} days</strong> after a successful build.</li>
              <li>• Credits <strong className="text-fg">never expire</strong>. A creator subscription adds monthly credits and an export discount.</li>
              <li>• Verify your email (+{CREDITS.EMAIL_VERIFY_BONUS}), connect Discord (+{CREDITS.DISCORD_BONUS}) and <Link href="/app/referrals" className="text-accent hover:underline">invite friends</Link> (+{CREDITS.REFERRAL_REWARD} each) for free credits.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
