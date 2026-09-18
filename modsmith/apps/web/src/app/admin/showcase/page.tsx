import Link from "next/link";
import { prisma, type Prisma } from "@modsmith/db";
import { PageHeader, Pagination } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { FilterBar } from "@/components/admin/filter-bar";
import { StatusTabs } from "@/components/admin/status-tabs";
import { ShowcaseActions } from "@/components/admin/moderation";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap, ResultCount } from "@/components/admin/table";
import { hrefWith, pageOf, PAGE_SIZE, skipTake, str, type SearchParams } from "@/components/admin/helpers";
import { requireStaff } from "@/components/admin/guard";
import { formatDate, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminShowcasePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = pageOf(sp);
  const status = str(sp, "status");
  const q = str(sp, "q");

  const where: Prisma.ShowcaseItemWhereInput = {
    ...(status ? { status: status as Prisma.EnumShowcaseStatusFilter["equals"] } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const [total, items, counts] = await Promise.all([
    prisma.showcaseItem.count({ where }),
    prisma.showcaseItem.findMany({ where, orderBy: { publishedAt: "desc" }, ...skipTake(page), include: { user: { select: { id: true, username: true } }, _count: { select: { reports: true } } } }),
    prisma.showcaseItem.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countFor = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Showcase" description="Community-published creations. Hidden and removed items disappear from the public gallery." />
      <div className="flex flex-wrap items-center gap-3">
        <StatusTabs current={status} hrefFor={(v) => hrefWith("/admin/showcase", sp, { status: v || undefined, page: undefined })}
          tabs={[
            { value: "", label: "All", count: counts.reduce((a, c) => a + c._count._all, 0) },
            { value: "PUBLISHED", label: "Published", count: countFor("PUBLISHED") },
            { value: "HIDDEN", label: "Hidden", count: countFor("HIDDEN") },
            { value: "REMOVED", label: "Removed", count: countFor("REMOVED") },
          ]} />
      </div>
      <FilterBar fields={[{ type: "search", name: "q", placeholder: "Title or slug…", label: "Search showcase" }]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />
      <TableWrap>
        <Table minWidth={1000}>
          <THead><Tr><Th>Item</Th><Th>Author</Th><Th>Category</Th><Th>Status</Th><Th className="text-right">Likes</Th><Th className="text-right">Views</Th><Th className="text-right">Reports</Th><Th>Published</Th><Th className="text-right">Actions</Th></Tr></THead>
          <TBody>
            {items.length === 0 ? <TableEmpty colSpan={9}>No showcase items match these filters.</TableEmpty> : items.map((i) => (
              <Tr key={i.id}>
                <Td>
                  <Link href={`/showcase/${i.slug}`} target="_blank" rel="noreferrer" className="font-medium hover:text-accent hover:underline underline-offset-4">{i.title}</Link>
                  <div className="font-mono text-[11px] text-fg-subtle">{i.slug}</div>
                </Td>
                <Td><Link href={`/admin/users/${i.userId}`} className="hover:text-accent hover:underline underline-offset-4">{i.user.username}</Link></Td>
                <Td><Badge variant="outline">{i.category}</Badge></Td>
                <Td><span className="flex items-center gap-1"><StatusBadge status={i.status} />{i.featured ? <Badge variant="accent">featured</Badge> : null}</span></Td>
                <Td className="text-right tabular-nums">{i.likeCount}</Td>
                <Td className="text-right tabular-nums text-fg-muted">{i.viewCount}</Td>
                <Td className="text-right tabular-nums">{i._count.reports > 0 ? <Link href={`/admin/reports?status=open`} className="font-medium text-danger hover:underline">{i._count.reports}</Link> : <span className="text-fg-subtle">0</span>}</Td>
                <Td className="whitespace-nowrap text-fg-muted" title={formatDate(i.publishedAt)}>{timeAgo(i.publishedAt)}</Td>
                <Td><ShowcaseActions id={i.id} status={i.status} featured={i.featured} /></Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/showcase", sp, { page: p })} />
    </div>
  );
}
