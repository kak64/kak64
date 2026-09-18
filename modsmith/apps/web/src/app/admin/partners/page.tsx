import Link from "next/link";
import { Handshake, Plus } from "lucide-react";
import { prisma, type Prisma } from "@modsmith/db";
import { PageHeader, Pagination, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/admin/filter-bar";
import { Table, TBody, Td, Th, THead, Tr, TableWrap, ResultCount, Bool } from "@/components/admin/table";
import { hrefWith, pageOf, PAGE_SIZE, skipTake, str, type SearchParams } from "@/components/admin/helpers";
import { requireAdmin } from "@/components/admin/guard";
import { formatCredits } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminPartnersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = pageOf(sp);
  const q = str(sp, "q");

  const where: Prisma.PartnerWhereInput = q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {};
  const [total, partners, referralStats] = await Promise.all([
    prisma.partner.count({ where }),
    prisma.partner.findMany({ where, orderBy: { priority: "desc" }, ...skipTake(page) }),
    prisma.partnerReferral.groupBy({ by: ["partnerId", "event"], _count: { _all: true } }),
  ]);

  const statsFor = (partnerId: string, event: string) => referralStats.find((s) => s.partnerId === partnerId && s.event === event)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Partners" description="Partner directory, referral codes and signup bonuses."
        actions={<Button asChild size="sm"><Link href="/admin/partners/new"><Plus />New partner</Link></Button>} />
      <FilterBar fields={[{ type: "search", name: "q", placeholder: "Name or slug…", label: "Search partners" }]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />
      {partners.length === 0 ? (
        <EmptyState icon={Handshake} title="No partners yet" description="Add a partner to give their community a referral code and bonus credits." action={{ label: "New partner", href: "/admin/partners/new" }} />
      ) : (
        <TableWrap>
          <Table minWidth={980}>
            <THead><Tr><Th>Partner</Th><Th>Category</Th><Th>Referral code</Th><Th className="text-right">Bonus</Th><Th className="text-right">Clicks</Th><Th className="text-right">Signups</Th><Th className="text-right">Bonuses paid</Th><Th className="text-right">Priority</Th><Th className="text-center">Active</Th></Tr></THead>
            <TBody>
              {partners.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <Link href={`/admin/partners/${p.id}`} className="font-medium hover:text-accent hover:underline underline-offset-4">{p.name}</Link>
                    <div className="font-mono text-[11px] text-fg-subtle">{p.slug}</div>
                  </Td>
                  <Td><Badge variant="outline">{p.category}</Badge></Td>
                  <Td className="font-mono text-xs">{p.referralCode}</Td>
                  <Td className="text-right tabular-nums">{formatCredits(p.bonusCredits)}</Td>
                  <Td className="text-right tabular-nums text-fg-muted">{statsFor(p.id, "click")}</Td>
                  <Td className="text-right tabular-nums">{statsFor(p.id, "signup")}</Td>
                  <Td className="text-right tabular-nums">{statsFor(p.id, "bonus")}</Td>
                  <Td className="text-right tabular-nums text-fg-muted">{p.priority}</Td>
                  <Td className="text-center"><Bool value={p.active} /></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/partners", sp, { page: p })} />
    </div>
  );
}
