import Link from "next/link";
import { prisma, type Prisma } from "@modsmith/db";
import { PageHeader, Pagination, Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/admin/filter-bar";
import { CreditAdjustDialog } from "@/components/admin/credit-adjust-dialog";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap, ResultCount } from "@/components/admin/table";
import { hrefWith, pageOf, PAGE_SIZE, skipTake, str, type SearchParams } from "@/components/admin/helpers";
import { requireAdmin } from "@/components/admin/guard";
import { formatCredits, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TYPES = ["SIGNUP_BONUS", "EMAIL_VERIFY_BONUS", "DISCORD_BONUS", "REFERRAL_REWARD", "PARTNER_BONUS", "PURCHASE", "EXPORT", "FAILED_JOB_REFUND", "PROMOTIONAL_GRANT", "SUBSCRIPTION_ALLOCATION", "ADMIN_ADJUSTMENT", "REFUND"] as const;

export default async function AdminCreditsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = pageOf(sp);
  const q = str(sp, "q");
  const type = str(sp, "type");
  const since = new Date(Date.now() - 30 * 86400_000);

  const where: Prisma.CreditTransactionWhereInput = {
    ...(type ? { type: type as Prisma.EnumCreditTransactionTypeFilter["equals"] } : {}),
    ...(q ? { user: { OR: [{ username: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } } : {}),
  };

  const [total, transactions, granted, spent, adjustments] = await Promise.all([
    prisma.creditTransaction.count({ where }),
    prisma.creditTransaction.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(page), include: { user: { select: { id: true, username: true, email: true } } } }),
    prisma.creditTransaction.aggregate({ where: { createdAt: { gte: since }, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.creditTransaction.aggregate({ where: { createdAt: { gte: since }, amount: { lt: 0 } }, _sum: { amount: true } }),
    prisma.creditTransaction.count({ where: { type: "ADMIN_ADJUSTMENT", createdAt: { gte: since } } }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Credits" description="Every ledger entry across the platform. Manual adjustments are audited."
        actions={<CreditAdjustDialog />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Granted 30d" value={formatCredits(granted._sum.amount ?? 0)} hint="all positive entries" />
        <Stat label="Spent 30d" value={formatCredits(-(spent._sum.amount ?? 0))} hint="all negative entries" />
        <Stat label="Manual adjustments 30d" value={adjustments.toLocaleString("en-US")} hint="admin grants & revokes" />
        <Stat label="Entries" value={total.toLocaleString("en-US")} hint="matching current filters" />
      </div>

      <FilterBar fields={[
        { type: "search", name: "q", placeholder: "Username or email…", label: "Search by user" },
        { type: "select", name: "type", label: "Type", options: TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ").toLowerCase() })) },
      ]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />

      <TableWrap>
        <Table minWidth={880}>
          <THead><Tr><Th>When</Th><Th>User</Th><Th>Type</Th><Th className="text-right">Amount</Th><Th className="text-right">Balance after</Th><Th>Reason</Th><Th>Reference</Th></Tr></THead>
          <TBody>
            {transactions.length === 0 ? <TableEmpty colSpan={7}>No transactions match these filters.</TableEmpty> : transactions.map((t) => (
              <Tr key={t.id}>
                <Td className="whitespace-nowrap text-fg-muted">{formatDateTime(t.createdAt)}</Td>
                <Td>
                  <Link href={`/admin/users/${t.userId}`} className="font-medium hover:text-accent hover:underline underline-offset-4">{t.user.username}</Link>
                  <div className="truncate text-xs text-fg-subtle">{t.user.email}</div>
                </Td>
                <Td><Badge variant={t.type === "ADMIN_ADJUSTMENT" ? "accent" : "outline"}>{t.type.replace(/_/g, " ").toLowerCase()}</Badge></Td>
                <Td className={`text-right tabular-nums font-medium ${t.amount < 0 ? "text-danger" : "text-success"}`}>{t.amount > 0 ? "+" : ""}{formatCredits(t.amount)}</Td>
                <Td className="text-right tabular-nums text-fg-muted">{formatCredits(t.balanceAfter)}</Td>
                <Td className="max-w-[280px] truncate" title={t.reason}>{t.reason}</Td>
                <Td className="text-fg-subtle">{t.referenceType === "job" && t.referenceId ? <Link href={`/admin/jobs/${t.referenceId}`} className="font-mono text-xs hover:text-accent hover:underline">job {t.referenceId.slice(0, 8)}…</Link> : t.referenceType ?? "—"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/credits", sp, { page: p })} />
    </div>
  );
}
