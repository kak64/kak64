import Link from "next/link";
import type { Metadata } from "next";
import { Coins, Activity, FolderOpen, CreditCard, Server, Gift, ArrowRight, Download, Plus } from "lucide-react";
import { prisma } from "@modsmith/db";
import { TOOL_BY_SLUG } from "@modsmith/core";
import { getEffectiveTools, getStorageLimits, storage } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { formatBytes, formatCredits, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, Stat } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { ToolCard } from "@/components/app/tool-card";
import { OnboardingCard } from "@/components/app/dashboard/onboarding-card";
import { ActiveJobs } from "@/components/app/dashboard/active-jobs";
import { CreationThumb } from "@/components/app/creations/creation-thumb";

export const metadata: Metadata = { title: "Dashboard" };

const ACTIVE = ["PENDING", "QUEUED", "PROCESSING", "PACKAGING"] as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const welcome = sp.welcome === "1";
  const [account, activeJobs, creationsCount, subscription, hubServers, hubLimits, referral, recentCreations, downloads, tools, discord] = await Promise.all([
    prisma.creditAccount.findUnique({ where: { userId: user.id }, select: { balance: true } }),
    prisma.processingJob.findMany({ where: { userId: user.id, status: { in: [...ACTIVE] } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, toolSlug: true, creationId: true, createdAt: true, creation: { select: { name: true } } } }),
    prisma.creation.count({ where: { userId: user.id, deletedAt: null } }),
    prisma.subscription.findFirst({ where: { userId: user.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] }, plan: { kind: "CREATOR" } }, select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, plan: { select: { name: true } } } }),
    prisma.serverHubProject.count({ where: { userId: user.id, deletedAt: null } }),
    getStorageLimits(user.id),
    prisma.referral.findUnique({ where: { ownerId: user.id }, select: { creditsEarned: true, qualified: true } }),
    prisma.creation.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 6, select: { id: true, name: true, toolSlug: true, status: true, thumbnailKey: true, updatedAt: true } }),
    prisma.auditLog.findMany({ where: { actorId: user.id, action: { in: ["creation.download", "job.download"] } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, action: true, targetId: true, createdAt: true } }),
    getEffectiveTools(),
    prisma.discordConnection.findUnique({ where: { userId: user.id }, select: { id: true } }),
  ]);
  const s = storage();
  const creations = await Promise.all(recentCreations.map(async (c) => ({ ...c, updatedAt: c.updatedAt.toISOString(), thumbnailUrl: c.thumbnailKey ? await s.signedGetUrl(c.thumbnailKey, { ttl: 3600 }).catch(() => null) : null })));
  const downloadTargets = await Promise.all(downloads.map(async (d) => {
    if (d.action === "creation.download" && d.targetId) { const c = await prisma.creation.findFirst({ where: { id: d.targetId, userId: user.id }, select: { name: true } }); return { ...d, label: c?.name ?? "Creation", href: `/app/creations/${d.targetId}` }; }
    if (d.action === "job.download" && d.targetId) { const j = await prisma.processingJob.findFirst({ where: { id: d.targetId, userId: user.id }, select: { resultName: true, toolSlug: true } }); return { ...d, label: j?.resultName ?? TOOL_BY_SLUG[j?.toolSlug ?? ""]?.name ?? "Job result", href: `/app/jobs/${d.targetId}` }; }
    return { ...d, label: "Download", href: "/app/creations" };
  }));
  const enabled = tools.filter((t) => t.enabled);
  const quick = [...enabled.filter((t) => t.category === "create").slice(0, 6), ...enabled.filter((t) => t.category === "optimize")];
  const storagePct = hubLimits.limitBytes > 0n ? Math.min(100, Math.round((Number(hubLimits.usedBytes) / Number(hubLimits.limitBytes)) * 100)) : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Hey {user.username}</h1><p className="mt-1 text-sm text-fg-muted">Here's what's happening in your workshop.</p></div>
        <Button asChild><Link href="/app/tools"><Plus /> New creation</Link></Button>
      </div>

      <OnboardingCard username={user.username} emailVerified={!!user.emailVerifiedAt} discordConnected={!!discord} hasCreation={creationsCount > 0} forceShow={welcome} />

      <section aria-label="Overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Link href="/app/credits" className="block rounded-lg focus-visible:outline-none"><Stat label="Credits" value={formatCredits(account?.balance)} hint={<span className="text-accent">Buy more →</span>} icon={Coins} /></Link>
        <Link href="/app/jobs" className="block"><Stat label="Active jobs" value={activeJobs.length} hint={activeJobs.length ? "Processing on our workers" : "No jobs running"} icon={Activity} /></Link>
        <Link href="/app/creations" className="block"><Stat label="Creations" value={creationsCount} hint="Saved in My Creations" icon={FolderOpen} /></Link>
        <Link href="/app/billing" className="block"><Stat label="Subscription" value={subscription ? subscription.plan.name : "Free"} hint={subscription ? `${subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} ${subscription.currentPeriodEnd ? timeAgo(subscription.currentPeriodEnd).replace("ago", "").trim() || "soon" : "—"}` : <span className="text-accent">Upgrade for discounts →</span>} icon={CreditCard} /></Link>
        <Link href="/app/hub" className="block"><div className="rounded-lg border border-border bg-bg-elevated p-4"><div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-fg-subtle">Server Hub<Server className="h-4 w-4" /></div><div className="mt-2 text-2xl font-semibold tabular-nums">{hubServers} <span className="text-base font-normal text-fg-muted">server{hubServers === 1 ? "" : "s"}</span></div><Progress value={storagePct} className="mt-2 h-1.5" aria-label="Hub storage used" /><div className="mt-1 text-xs text-fg-muted">{formatBytes(hubLimits.usedBytes)} of {formatBytes(hubLimits.limitBytes)} storage</div></div></Link>
        <Link href="/app/referrals" className="block"><Stat label="Referral earnings" value={formatCredits(referral?.creditsEarned)} hint={`${referral?.qualified ?? 0} qualified referral${referral?.qualified === 1 ? "" : "s"}`} icon={Gift} /></Link>
      </section>

      {activeJobs.length ? (
        <section aria-labelledby="active-jobs">
          <div className="mb-3 flex items-center justify-between"><h2 id="active-jobs" className="text-base font-semibold">Active jobs</h2><Link href="/app/jobs" className="text-sm text-accent hover:underline">All jobs</Link></div>
          <ActiveJobs jobs={activeJobs.map((j) => ({ id: j.id, toolName: TOOL_BY_SLUG[j.toolSlug]?.name ?? j.toolSlug, creationId: j.creationId, creationName: j.creation?.name ?? null, createdAt: j.createdAt.toISOString() }))} />
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-3">
        <section aria-labelledby="recent-creations" className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2 id="recent-creations" className="text-base font-semibold">Recent creations</h2><Link href="/app/creations" className="text-sm text-accent hover:underline">View all</Link></div>
          {creations.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {creations.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/creations/${c.id}`} className="block overflow-hidden rounded-lg border border-border bg-bg-elevated transition-colors hover:border-accent/50">
                    <CreationThumb url={c.thumbnailUrl} toolSlug={c.toolSlug} name={c.name} className="aspect-video" />
                    <div className="p-3"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{c.name}</span><StatusBadge status={c.status} /></div><div className="mt-1 text-xs text-fg-muted">{TOOL_BY_SLUG[c.toolSlug]?.name ?? c.toolSlug} · {timeAgo(c.updatedAt)}</div></div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={FolderOpen} title="No creations yet" description="Pick a tool, upload a file and export your first FiveM resource." action={{ label: "Browse tools", href: "/app/tools" }} />}
        </section>
        <section aria-labelledby="recent-downloads">
          <h2 id="recent-downloads" className="mb-3 text-base font-semibold">Recent downloads</h2>
          {downloadTargets.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border bg-bg-elevated">
              {downloadTargets.map((d) => (
                <li key={d.id}><Link href={d.href} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-bg-subtle"><Download className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden /><span className="min-w-0 flex-1 truncate">{d.label}</span><span className="shrink-0 text-xs text-fg-subtle">{timeAgo(d.createdAt)}</span></Link></li>
              ))}
            </ul>
          ) : <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-fg-muted">Downloads of your exported resources will show up here.</p>}
        </section>
      </div>

      <section aria-labelledby="quick-launch">
        <div className="mb-3 flex items-center justify-between"><h2 id="quick-launch" className="text-base font-semibold">Quick launch</h2><Link href="/app/tools" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">All tools <ArrowRight className="h-3.5 w-3.5" /></Link></div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{quick.map((t) => <li key={t.slug}><ToolCard tool={t} compact /></li>)}</ul>
      </section>
    </div>
  );
}
