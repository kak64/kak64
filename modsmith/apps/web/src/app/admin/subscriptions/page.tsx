import Link from "next/link";
import { prisma, type Prisma } from "@modsmith/db";
import { PageHeader, Pagination, Stat } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { FilterBar } from "@/components/admin/filter-bar";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap, ResultCount } from "@/components/admin/table";
import { hrefWith, pageOf, PAGE_SIZE, skipTake, str, type SearchParams } from "@/components/admin/helpers";
import { requireAdmin } from "@/components/admin/guard";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUSES = ["INCOMPLETE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "UNPAID", "EXPIRED"] as const;

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = pageOf(sp);
  const status = str(sp, "status");
  const planSlug = str(sp, "plan");
  const q = str(sp, "q");

  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, name: true } });
  const where: Prisma.SubscriptionWhereInput = {
    ...(status ? { status: status as Prisma.EnumSubscriptionStatusFilter["equals"] } : {}),
    ...(planSlug ? { plan: { slug: planSlug } } : {}),
    ...(q ? { user: { OR: [{ username: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } } : {}),
  };

  const [total, subs, active, trialing, pastDue] = await Promise.all([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(page), include: { user: { select: { id: true, username: true, email: true } }, plan: { select: { name: true, slug: true, monthlyPriceCents: true, yearlyPriceCents: true, currency: true } } } }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: "TRIALING" } }),
    prisma.subscription.count({ where: { status: "PAST_DUE" } }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Subscriptions" description="Read-only view of every subscription. Lifecycle changes happen in Stripe." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active" value={active.toLocaleString("en-US")} />
        <Stat label="Trialing" value={trialing.toLocaleString("en-US")} />
        <Stat label="Past due" value={pastDue.toLocaleString("en-US")} hint="payment retry in progress" />
        <Stat label="Matching filters" value={total.toLocaleString("en-US")} />
      </div>
      <FilterBar fields={[
        { type: "search", name: "q", placeholder: "Username or email…", label: "Search subscriber" },
        { type: "select", name: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ").toLowerCase() })) },
        { type: "select", name: "plan", label: "Plan", options: plans.map((p) => ({ value: p.slug, label: p.name })) },
      ]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />
      <TableWrap>
        <Table minWidth={1000}>
          <THead><Tr><Th>User</Th><Th>Plan</Th><Th>Interval</Th><Th className="text-right">Price</Th><Th>Status</Th><Th>Current period</Th><Th>Stripe</Th><Th>Created</Th></Tr></THead>
          <TBody>
            {subs.length === 0 ? <TableEmpty colSpan={8}>No subscriptions match these filters.</TableEmpty> : subs.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <Link href={`/admin/users/${s.userId}`} className="font-medium hover:text-accent hover:underline underline-offset-4">{s.user.username}</Link>
                  <div className="truncate text-xs text-fg-subtle">{s.user.email}</div>
                </Td>
                <Td className="font-medium">{s.plan.name}</Td>
                <Td className="text-fg-muted">{s.interval}</Td>
                <Td className="text-right tabular-nums">{formatMoney(s.interval === "year" ? s.plan.yearlyPriceCents : s.plan.monthlyPriceCents, s.plan.currency)}</Td>
                <Td>
                  <StatusBadge status={s.status} />
                  {s.cancelAtPeriodEnd ? <Badge variant="warning" className="ml-1">cancels</Badge> : null}
                </Td>
                <Td className="whitespace-nowrap text-fg-muted">{s.currentPeriodStart ? `${formatDate(s.currentPeriodStart)} → ${formatDate(s.currentPeriodEnd)}` : "—"}</Td>
                <Td className="max-w-[160px] truncate font-mono text-[11px] text-fg-subtle" title={s.stripeSubscriptionId ?? ""}>{s.stripeSubscriptionId ?? "—"}</Td>
                <Td className="whitespace-nowrap text-fg-muted">{formatDate(s.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/subscriptions", sp, { page: p })} />
    </div>
  );
}
