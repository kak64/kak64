import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@modsmith/db";
import { getTool } from "@modsmith/core";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { UserAvatar } from "@/components/ui/avatar";
import { Section, SectionTable } from "@/components/admin/section";
import { KeyValue, Table, TBody, Td, Th, THead, Tr, TableEmpty } from "@/components/admin/table";
import { JsonViewer } from "@/components/admin/json-viewer";
import { UserAdminActions } from "@/components/admin/user-actions";
import { CreditAdjustDialog } from "@/components/admin/credit-adjust-dialog";
import { requireStaff } from "@/components/admin/guard";
import { formatCredits, formatDate, formatDateTime, formatMoney, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "User", robots: { index: false, follow: false } };

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const isAdmin = staff.role === "ADMIN";

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      creditAccount: true,
      discordConnection: { select: { discordId: true, username: true, connectedAt: true } },
      subscriptions: { include: { plan: { select: { name: true, slug: true } } }, orderBy: { createdAt: "desc" } },
      creditPurchases: { orderBy: { createdAt: "desc" }, take: 20, include: { pack: { select: { name: true } } } },
      sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, userAgent: true, lastSeenAt: true, createdAt: true }, orderBy: { lastSeenAt: "desc" } },
      referredBy: { select: { id: true, username: true } },
      _count: { select: { jobs: true, creations: true, reviews: true, serverHubProjects: true, showcaseItems: true } },
    },
  });
  if (!user) notFound();

  const [transactions, jobs, auditLogs] = await Promise.all([
    prisma.creditTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.processingJob.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, toolSlug: true, status: true, chargedCredits: true, createdAt: true, errorCode: true } }),
    prisma.auditLog.findMany({ where: { OR: [{ actorId: user.id }, { targetType: "user", targetId: user.id }] }, orderBy: { createdAt: "desc" }, take: 30, include: { actor: { select: { id: true, username: true } } } }),
  ]);

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/admin/users"><ArrowLeft />All users</Link></Button>
      <PageHeader
        title={user.username}
        description={user.email}
        actions={isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            <CreditAdjustDialog user={{ id: user.id, username: user.username, balance: user.creditAccount?.balance ?? 0 }} />
            <UserAdminActions userId={user.id} status={user.status} role={user.role} verified={!!user.emailVerifiedAt} isSelf={user.id === staff.id} />
          </div>
        ) : undefined}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section title="Profile" className="xl:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <UserAvatar username={user.username} src={user.avatarUrl} className="h-12 w-12" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{user.username}</span>
                <Badge variant={user.role === "ADMIN" ? "accent" : user.role === "MODERATOR" ? "info" : "default"}>{user.role.toLowerCase()}</Badge>
                <StatusBadge status={user.status} />
                {user.emailVerifiedAt ? <Badge variant="success">verified</Badge> : <Badge variant="warning">unverified</Badge>}
              </div>
              {user.bio ? <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{user.bio}</p> : null}
            </div>
          </div>
          <KeyValue items={[
            { label: "User id", value: <span className="font-mono text-xs">{user.id}</span> },
            { label: "Email", value: user.email },
            { label: "Created", value: formatDateTime(user.createdAt) },
            { label: "Last login", value: user.lastLoginAt ? `${formatDateTime(user.lastLoginAt)} (${timeAgo(user.lastLoginAt)})` : "never" },
            { label: "Verified at", value: user.emailVerifiedAt ? formatDateTime(user.emailVerifiedAt) : "—" },
            { label: "Discord", value: user.discordConnection ? `${user.discordConnection.username} (${user.discordConnection.discordId})` : "not linked" },
            { label: "Referral code", value: <span className="font-mono text-xs">{user.referralCode}</span> },
            { label: "Referred by", value: user.referredBy ? <Link href={`/admin/users/${user.referredBy.id}`} className="hover:text-accent hover:underline">{user.referredBy.username}</Link> : "—" },
            { label: "Partner code", value: user.partnerRefCode ?? "—" },
            { label: "Stripe customer", value: user.stripeCustomerId ? <span className="font-mono text-xs">{user.stripeCustomerId}</span> : "—" },
            { label: "Profile public", value: user.profilePublic ? "yes" : "no" },
            { label: "Deleted at", value: user.deletedAt ? formatDateTime(user.deletedAt) : "—" },
          ]} />
        </Section>

        <Section title="Balances & counts">
          <KeyValue className="sm:grid-cols-1" items={[
            { label: "Credit balance", value: <span className="tabular-nums font-semibold text-accent">{formatCredits(user.creditAccount?.balance)}</span> },
            { label: "Lifetime earned", value: <span className="tabular-nums">{formatCredits(user.creditAccount?.lifetimeEarned)}</span> },
            { label: "Lifetime spent", value: <span className="tabular-nums">{formatCredits(user.creditAccount?.lifetimeSpent)}</span> },
            { label: "Jobs", value: <Link href={`/admin/jobs?userId=${user.id}`} className="hover:text-accent hover:underline">{user._count.jobs}</Link> },
            { label: "Creations", value: <Link href={`/admin/creations?userId=${user.id}`} className="hover:text-accent hover:underline">{user._count.creations}</Link> },
            { label: "Showcase items", value: user._count.showcaseItems },
            { label: "Reviews", value: user._count.reviews },
            { label: "Hub projects", value: user._count.serverHubProjects },
            { label: "Active sessions", value: user.sessions.length },
          ]} />
        </Section>
      </div>

      <SectionTable title="Credit ledger" description="50 most recent transactions.">
        <Table minWidth={760}>
          <THead><Tr><Th>When</Th><Th>Type</Th><Th className="text-right">Amount</Th><Th className="text-right">Balance after</Th><Th>Reason</Th><Th>Reference</Th></Tr></THead>
          <TBody>
            {transactions.length === 0 ? <TableEmpty colSpan={6}>No credit transactions yet.</TableEmpty> : transactions.map((t) => (
              <Tr key={t.id}>
                <Td className="whitespace-nowrap text-fg-muted">{formatDateTime(t.createdAt)}</Td>
                <Td><Badge variant="outline">{t.type.replace(/_/g, " ").toLowerCase()}</Badge></Td>
                <Td className={`text-right tabular-nums font-medium ${t.amount < 0 ? "text-danger" : "text-success"}`}>{t.amount > 0 ? "+" : ""}{formatCredits(t.amount)}</Td>
                <Td className="text-right tabular-nums text-fg-muted">{formatCredits(t.balanceAfter)}</Td>
                <Td className="max-w-[260px] truncate" title={t.reason}>{t.reason}</Td>
                <Td className="text-fg-subtle">{t.referenceType === "job" && t.referenceId ? <Link href={`/admin/jobs/${t.referenceId}`} className="font-mono text-xs hover:text-accent hover:underline">job {t.referenceId.slice(0, 8)}…</Link> : t.referenceType ?? "—"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </SectionTable>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionTable title="Recent jobs" actions={<Button asChild variant="ghost" size="sm"><Link href={`/admin/jobs?userId=${user.id}`}>All jobs</Link></Button>}>
          <Table minWidth={520}>
            <THead><Tr><Th>Job</Th><Th>Tool</Th><Th>Status</Th><Th className="text-right">Credits</Th><Th>When</Th></Tr></THead>
            <TBody>
              {jobs.length === 0 ? <TableEmpty colSpan={5}>No jobs yet.</TableEmpty> : jobs.map((j) => (
                <Tr key={j.id}>
                  <Td><Link href={`/admin/jobs/${j.id}`} className="font-mono text-xs hover:text-accent hover:underline">{j.id.slice(0, 8)}…</Link></Td>
                  <Td>{getTool(j.toolSlug)?.name ?? j.toolSlug}</Td>
                  <Td><StatusBadge status={j.status} />{j.errorCode ? <span className="ml-1 text-[11px] text-danger">{j.errorCode}</span> : null}</Td>
                  <Td className="text-right tabular-nums">{j.chargedCredits ?? 0}</Td>
                  <Td className="whitespace-nowrap text-fg-muted">{timeAgo(j.createdAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </SectionTable>

        <SectionTable title="Subscriptions">
          <Table minWidth={520}>
            <THead><Tr><Th>Plan</Th><Th>Interval</Th><Th>Status</Th><Th>Period end</Th></Tr></THead>
            <TBody>
              {user.subscriptions.length === 0 ? <TableEmpty colSpan={4}>No subscriptions.</TableEmpty> : user.subscriptions.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium">{s.plan.name}</Td>
                  <Td className="text-fg-muted">{s.interval}</Td>
                  <Td><StatusBadge status={s.status} />{s.cancelAtPeriodEnd ? <Badge variant="warning" className="ml-1">cancels</Badge> : null}</Td>
                  <Td className="whitespace-nowrap text-fg-muted">{formatDate(s.currentPeriodEnd)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </SectionTable>

        <SectionTable title="Purchases">
          <Table minWidth={560}>
            <THead><Tr><Th>When</Th><Th>Pack</Th><Th className="text-right">Credits</Th><Th className="text-right">Amount</Th><Th>Status</Th></Tr></THead>
            <TBody>
              {user.creditPurchases.length === 0 ? <TableEmpty colSpan={5}>No purchases.</TableEmpty> : user.creditPurchases.map((p) => (
                <Tr key={p.id}>
                  <Td className="whitespace-nowrap text-fg-muted">{formatDate(p.createdAt)}</Td>
                  <Td>{p.pack?.name ?? "Custom"}</Td>
                  <Td className="text-right tabular-nums">{formatCredits(p.credits + p.bonusCredits)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(p.amountCents, p.currency)}</Td>
                  <Td><StatusBadge status={p.status} /></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </SectionTable>

        <SectionTable title="Active sessions">
          <Table minWidth={520}>
            <THead><Tr><Th>Device</Th><Th>Started</Th><Th>Last seen</Th></Tr></THead>
            <TBody>
              {user.sessions.length === 0 ? <TableEmpty colSpan={3}>No active sessions.</TableEmpty> : user.sessions.map((s) => (
                <Tr key={s.id}>
                  <Td className="max-w-[320px] truncate text-fg-muted" title={s.userAgent ?? ""}>{s.userAgent ?? "Unknown device"}</Td>
                  <Td className="whitespace-nowrap text-fg-muted">{formatDate(s.createdAt)}</Td>
                  <Td className="whitespace-nowrap text-fg-muted">{timeAgo(s.lastSeenAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </SectionTable>
      </div>

      <Section title="Audit trail" description="Actions by and against this account (30 most recent).">
        {auditLogs.length === 0 ? <p className="text-sm text-fg-muted">Nothing recorded.</p> : (
          <ul className="space-y-2">
            {auditLogs.map((a) => (
              <li key={a.id} className="rounded-md border border-border bg-bg-muted/40 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline">{a.action}</Badge>
                  <span className="text-fg-muted">{a.actor ? <Link href={`/admin/users/${a.actor.id}`} className="hover:text-accent hover:underline">{a.actor.username}</Link> : a.actorType}</span>
                  <span className="text-fg-subtle">{formatDateTime(a.createdAt)}</span>
                </div>
                {a.before || a.after ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {a.before ? <JsonViewer label="Before" value={a.before} maxHeight={200} /> : null}
                    {a.after ? <JsonViewer label="After" value={a.after} maxHeight={200} /> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
