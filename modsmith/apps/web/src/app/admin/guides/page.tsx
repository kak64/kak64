import Link from "next/link";
import { Plus, BookOpen } from "lucide-react";
import { prisma, type Prisma } from "@modsmith/db";
import { PageHeader, Pagination, EmptyState } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/admin/filter-bar";
import { NewCategoryButton } from "@/components/admin/category-manager";
import { Table, TBody, Td, Th, THead, Tr, TableWrap, ResultCount } from "@/components/admin/table";
import { hrefWith, pageOf, PAGE_SIZE, skipTake, str, type SearchParams } from "@/components/admin/helpers";
import { requireStaff } from "@/components/admin/guard";
import { formatDate, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminGuidesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = pageOf(sp);
  const q = str(sp, "q");
  const state = str(sp, "state");
  const categoryId = str(sp, "category");

  const categories = await prisma.guideCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { guides: true } } } });
  const where: Prisma.GuideWhereInput = {
    ...(state ? { state: state as Prisma.EnumPublishStateFilter["equals"] } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, guides] = await Promise.all([
    prisma.guide.count({ where }),
    prisma.guide.findMany({ where, orderBy: { updatedAt: "desc" }, ...skipTake(page), include: { category: { select: { name: true } }, author: { select: { username: true } } } }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Guides" description="Long-form Markdown guides published on the marketing site."
        actions={<><NewCategoryButton /><Button asChild size="sm"><Link href="/admin/guides/new"><Plus />New guide</Link></Button></>} />

      {categories.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((c) => (
            <Link key={c.id} href={hrefWith("/admin/guides", sp, { category: categoryId === c.id ? undefined : c.id, page: undefined })}>
              <Badge variant={categoryId === c.id ? "accent" : "outline"}>{c.name} <span className="tabular-nums opacity-70">{c._count.guides}</span></Badge>
            </Link>
          ))}
        </div>
      ) : null}

      <FilterBar fields={[
        { type: "search", name: "q", placeholder: "Title or slug…", label: "Search guides" },
        { type: "select", name: "state", label: "State", options: [{ value: "DRAFT", label: "Draft" }, { value: "PUBLISHED", label: "Published" }, { value: "ARCHIVED", label: "Archived" }] },
      ]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />

      {guides.length === 0 ? (
        <EmptyState icon={BookOpen} title="No guides yet" description="Write the first guide — it will appear under /guides once published." action={{ label: "New guide", href: "/admin/guides/new" }} />
      ) : (
        <TableWrap>
          <Table minWidth={880}>
            <THead><Tr><Th>Title</Th><Th>Category</Th><Th>State</Th><Th>Author</Th><Th>Published</Th><Th>Updated</Th></Tr></THead>
            <TBody>
              {guides.map((g) => (
                <Tr key={g.id}>
                  <Td>
                    <Link href={`/admin/guides/${g.id}`} className="font-medium hover:text-accent hover:underline underline-offset-4">{g.title}</Link>
                    <div className="font-mono text-[11px] text-fg-subtle">{g.slug}</div>
                  </Td>
                  <Td><Badge variant="outline">{g.category.name}</Badge></Td>
                  <Td><StatusBadge status={g.state} /></Td>
                  <Td className="text-fg-muted">{g.author?.username ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-fg-muted">{g.publishedAt ? formatDate(g.publishedAt) : "—"}</Td>
                  <Td className="whitespace-nowrap text-fg-muted">{timeAgo(g.updatedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/guides", sp, { page: p })} />
    </div>
  );
}
