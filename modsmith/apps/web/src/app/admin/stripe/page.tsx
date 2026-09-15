import Link from "next/link";
import { prisma } from "@modsmith/db";
import { stripeConfigured } from "@modsmith/services";
import { PageHeader, Stat, Alert } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { SectionTable } from "@/components/admin/section";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty } from "@/components/admin/table";
import { requireAdmin } from "@/components/admin/guard";
import { formatDate, formatDateTime, formatMoney, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminStripePage() {
  await requireAdmin();
  const day = new Date(Date.now() - 86400_000);
  const [events, purchases, subscriptions, failures24h, processed24h, revenue30d] = await Promise.all([
    prisma.stripeWebhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.creditPurchase.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { id: true, username: true } }, pack: { select: { name: true } } } }),
    prisma.subscription.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { id: true, username: true } }, plan: { select: { name: true } } } }),
    prisma.stripeWebhookEvent.count({ where: { error: { not: null }, createdAt: { gte: day } } }),
    prisma.stripeWebhookEvent.count({ where: { processedAt: { not: null }, createdAt: { gte: day } } }),
    prisma.creditPurchase.aggregate({ where: { status: "PAID", paidAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, _sum: { amountCents: true } }),
  ]);
  const configured = stripeConfigured();

  return (
    <div className="space-y-4">
      <PageHeader title="Stripe" description="Webhook delivery, recent purchases and subscription activity." />
      {configured
        ? <Alert variant="success" title="Stripe is configured">Secret key present. Webhook events below are recorded as they arrive at /api/v1/billing/webhook.</Alert>
        : <Alert variant="warning" title="Stripe is not configured">No secret key in the environment — checkout and webhooks are disabled.</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue 30d" value={formatMoney(revenue30d._sum.amountCents ?? 0)} hint="paid credit purchases" />
        <Stat label="Events processed 24h" value={processed24h.toLocaleString("en-US")} />
        <Stat label="Event failures 24h" value={failures24h.toLocaleString("en-US")} hint={failures24h ? "needs investigation" : "all clear"} />
        <Stat label="Configured" value={configured ? "Yes" : "No"} />
      </div>

      <SectionTable title="Webhook events" description="50 most recent Stripe events.">
        <Table minWidth={860}>
          <THead><Tr><Th>Event id</Th><Th>Type</Th><Th>Received</Th><Th>Processed</Th><Th>Error</Th></Tr></THead>
          <TBody>
            {events.length === 0 ? <TableEmpty colSpan={5}>No webhook events recorded yet.</TableEmpty> : events.map((e) => (
              <Tr key={e.id}>
                <Td className="font-mono text-[11px] text-fg-muted">{e.id}</Td>
                <Td><Badge variant="outline">{e.type}</Badge></Td>
                <Td className="whitespace-nowrap text-fg-muted" title={formatDateTime(e.createdAt)}>{timeAgo(e.createdAt)}</Td>
                <Td>{e.processedAt ? <Badge variant="success">processed</Badge> : e.error ? <Badge variant="danger">failed</Badge> : <Badge variant="warning">pending</Badge>}</Td>
                <Td className="max-w-[320px] truncate text-danger" title={e.error ?? ""}>{e.error ?? "—"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </SectionTable>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionTable title="Recent purchases">
          <Table minWidth={560}>
            <THead><Tr><Th>User</Th><Th>Pack</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th>When</Th></Tr></THead>
            <TBody>
              {purchases.length === 0 ? <TableEmpty colSpan={5}>No purchases yet.</TableEmpty> : purchases.map((p) => (
                <Tr key={p.id}>
                  <Td><Link href={`/admin/users/${p.userId}`} className="hover:text-accent hover:underline underline-offset-4">{p.user.username}</Link></Td>
                  <Td className="text-fg-muted">{p.pack?.name ?? "Custom"}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(p.amountCents, p.currency)}</Td>
                  <Td><StatusBadge status={p.status} /></Td>
                  <Td className="whitespace-nowrap text-fg-muted">{formatDate(p.createdAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </SectionTable>

        <SectionTable title="Recent subscriptions" actions={null}>
          <Table minWidth={560}>
            <THead><Tr><Th>User</Th><Th>Plan</Th><Th>Interval</Th><Th>Status</Th><Th>Period end</Th></Tr></THead>
            <TBody>
              {subscriptions.length === 0 ? <TableEmpty colSpan={5}>No subscriptions yet.</TableEmpty> : subscriptions.map((s) => (
                <Tr key={s.id}>
                  <Td><Link href={`/admin/users/${s.userId}`} className="hover:text-accent hover:underline underline-offset-4">{s.user.username}</Link></Td>
                  <Td className="text-fg-muted">{s.plan.name}</Td>
                  <Td className="text-fg-muted">{s.interval}</Td>
                  <Td><StatusBadge status={s.status} /></Td>
                  <Td className="whitespace-nowrap text-fg-muted">{formatDate(s.currentPeriodEnd)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </SectionTable>
      </div>
    </div>
  );
}
