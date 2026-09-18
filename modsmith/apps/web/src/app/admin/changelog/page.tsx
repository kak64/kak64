import Link from "next/link";
import { History, Plus } from "lucide-react";
import { prisma, type Prisma } from "@modsmith/db";
import { getTool } from "@modsmith/core";
import { PageHeader, Pagination, EmptyState } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/admin/filter-bar";
import { Table, TBody, Td, Th, THead, Tr, TableWrap, ResultCount } from "@/components/admin/table";
import { hrefWith, pageOf, PAGE_SIZE, skipTake, str, type SearchParams } from "@/components/admin/helpers";
import { requireStaff } from "@/components/admin/guard";
import { formatDate, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CATEGORY_VARIANT: Record<string, "accent" | "info" | "success" | "default"> = { feature: "accent", improvement: "info", fix: "success", tool: "default" };

export default async function AdminChangelogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = pageOf(sp);
  const q = str(sp, "q");
  const state = str(sp, "state");
  const category = str(sp, "category");

  const where: Prisma.ChangelogEntryWhereInput = {
    ...(state ? { state: state as Prisma.EnumPublishStateFilter["equals"] } : {}),
    ...(category ? { category } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { version: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, entries] = await Promise.all([
    prisma.changelogEntry.count({ where }),
    prisma.changelogEntry.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(page) }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Changelog" description="Release notes shown on the public changelog page."
        actions={<Button asChild size="sm"><Link href="/admin/changelog/new"><Plus />New entry</Link></Button>} />
      <FilterBar fields={[
        { type: "search", name: "q", placeholder: "Title or version…", label: "Search changelog" },
        { type: "select", name: "state", label: "State", options: [{ value: "DRAFT", label: "Draft" }, { value: "PUBLISHED", label: "Published" }, { value: "ARCHIVED", label: "Archived" }] },
        { type: "select", name: "category", label: "Category", options: [{ value: "feature", label: "Feature" }, { value: "improvement", label: "Improvement" }, { value: "fix", label: "Fix" }, { value: "tool", label: "Tool" }] },
      ]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />
      {entries.length === 0 ? (
        <EmptyState icon={History} title="No changelog entries" description="Publish your first release note." action={{ label: "New entry", href: "/admin/changelog/new" }} />
      ) : (
        <TableWrap>
          <Table minWidth={820}>
            <THead><Tr><Th>Version</Th><Th>Title</Th><Th>Category</Th><Th>Tool</Th><Th>State</Th><Th>Published</Th><Th>Updated</Th></Tr></THead>
            <TBody>
              {entries.map((e) => (
                <Tr key={e.id}>
                  <Td className="font-mono text-xs font-medium">{e.version}</Td>
                  <Td><Link href={`/admin/changelog/${e.id}`} className="font-medium hover:text-accent hover:underline underline-offset-4">{e.title}</Link></Td>
                  <Td><Badge variant={CATEGORY_VARIANT[e.category] ?? "default"}>{e.category}</Badge></Td>
                  <Td className="text-fg-muted">{e.toolSlug ? getTool(e.toolSlug)?.name ?? e.toolSlug : "—"}</Td>
                  <Td><StatusBadge status={e.state} /></Td>
                  <Td className="whitespace-nowrap text-fg-muted">{e.publishedAt ? formatDate(e.publishedAt) : "—"}</Td>
                  <Td className="whitespace-nowrap text-fg-muted">{timeAgo(e.updatedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/changelog", sp, { page: p })} />
    </div>
  );
}
