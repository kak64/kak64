import type { Metadata } from "next";
import { Coins, MousePointerClick, UserPlus, BadgeCheck } from "lucide-react";
import { prisma } from "@modsmith/db";
import { CREDITS } from "@modsmith/core";
import { env, getSetting } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { formatCredits, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/misc";
import { ShareReferral } from "@/components/app/referrals/share-referral";

export const metadata: Metadata = { title: "Referrals" };
export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const user = (await getCurrentUser())!;
  const [referral, reward] = await Promise.all([
    prisma.referral.findUnique({ where: { ownerId: user.id }, include: { conversions: { orderBy: { createdAt: "desc" }, take: 50, include: { referredUser: { select: { username: true } } } } } }),
    getSetting<number>("credits.referralReward").catch(() => CREDITS.REFERRAL_REWARD),
  ]);
  const code = referral?.code ?? user.referralCode;
  const url = `${env().APP_URL}/register?ref=${encodeURIComponent(code)}`;

  return (
    <div className="space-y-8">
      <PageHeader title="Referrals" description={`Invite creators to Modsmith and earn ${formatCredits(reward)} credits for every one who builds their first asset.`} />

      <Card>
        <CardHeader><CardTitle>Your referral link</CardTitle></CardHeader>
        <CardContent><ShareReferral url={url} reward={reward} /></CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Clicks" value={formatCredits(referral?.clicks)} icon={MousePointerClick} hint="Visits from your link" />
        <Stat label="Sign-ups" value={formatCredits(referral?.signups)} icon={UserPlus} hint="Accounts created" />
        <Stat label="Qualified" value={formatCredits(referral?.qualified)} icon={BadgeCheck} hint="Completed a first build" />
        <Stat label="Credits earned" value={formatCredits(referral?.creditsEarned)} icon={Coins} hint={`${formatCredits(reward)} per referral`} />
      </section>

      <section aria-labelledby="ref-history">
        <h2 id="ref-history" className="mb-3 text-lg font-semibold">Referral history</h2>
        {referral?.conversions.length ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-bg-elevated">
            <table className="w-full text-sm">
              <caption className="sr-only">People who signed up with your link</caption>
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle"><th scope="col" className="px-3 py-2">Creator</th><th scope="col" className="px-3 py-2">Status</th><th scope="col" className="px-3 py-2">Signed up</th><th scope="col" className="px-3 py-2">Qualified</th><th scope="col" className="px-3 py-2">Reward</th></tr></thead>
              <tbody>
                {referral.conversions.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 font-medium">{c.referredUser.username}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={c.status} /></td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">{formatDate(c.createdAt)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">{c.qualifiedAt ? formatDate(c.qualifiedAt) : "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{c.rewardCredits ? <span className="text-success">+{formatCredits(c.rewardCredits)}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-sm text-fg-muted">No referrals yet. Share your link in your server's Discord or with creators you know.</p>}
      </section>

      <Card>
        <CardHeader><CardTitle>How it works</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-fg-muted">
            <li><strong className="text-fg">1.</strong> Share your link. Every click is counted so you can see what works.</li>
            <li><strong className="text-fg">2.</strong> They sign up and get their own {CREDITS.SIGNUP_BONUS} welcome credits.</li>
            <li><strong className="text-fg">3.</strong> When they complete their <strong className="text-fg">first successful build</strong>, {formatCredits(reward)} credits land in your balance automatically.</li>
          </ol>
          <p className="mt-3 text-xs text-fg-subtle">One reward per referred account. Self-referrals and duplicate accounts are rejected.</p>
        </CardContent>
      </Card>
    </div>
  );
}
