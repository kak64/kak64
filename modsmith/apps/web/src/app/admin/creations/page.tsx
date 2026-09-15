import Link from "next/link";
import { prisma, type Prisma } from "@modsmith/db";
import { TOOLS, getTool } from "@modsmith/core";
import { PageHeader, Pagination } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { FilterBar } from "@/components/admin/filter-bar";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap, ResultCount } from "@/components/admin/table";
import { hrefWith, pageOf, PAGE_SIZE, skipTake, str, type SearchParams } from "@/components/admin/helpers";
import { requireStaff } from "@/components/admin/guard";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUSES = ["DRAFT", "PROCESSING", "READY", "FAILED", "ARCHIVED"] as const;

export default async function AdminCreationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = pageOf(sp);
  const q = str(sp, "q");
  const toolSlug = str(sp, "toolSlug");
  const status = str(sp, "status");
  const userId = str(sp, "userId");

  const where: Prisma.CreationWhereInput = {
    deletedAt: null,
    ...(toolSlug ? { toolSlug } : {}),
    ...(userId ? { userId } : {}),
    ...(status ? { status: status as Prisma.EnumCreationStatusFilter["equals"] } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { id: q }] } : {}),
  };

  const [total, creations] = await Promise.all([
    prisma.creation.count({ where }),
    prisma.creation.findMany({
      where, orderBy: { createdAt: "desc" }, ...skipTake(page),
      include: { user: { select: { id: true, username: true } }, currentVersion: { select: { version: true, sizeBytes: true } }, showcaseItem: { select: { slug: true, status: true, featured: true } } },
    }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Creations" description="Saved projects and their latest exported version." />
      <FilterBar fields={[
        { type: "search", name: "q", placeholder: "Name or id…", label: "Search creations" },
        { type: "select", name: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s.toLowerCase() })) },
        { type: "select", name: "toolSlug", label: "Tool", options: TOOLS.map((t) => ({ value: t.slug, label: t.name })) },
      ]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />
      <TableWrap>
        <Table minWidth={960}>
          <THead><Tr><Th>Creation</Th><Th>Owner</Th><Th>Tool</Th><Th>Status</Th><Th className="text-right">Version</Th><Th className="text-right">Size</Th><Th>Showcase</Th><Th>Updated</Th></Tr></THead>
          <TBody>
            {creations.length === 0 ? <TableEmpty colSpan={8}>No creations match these filters.</TableEmpty> : creations.map((c) => (
              <Tr key={c.id}>
                <Td>
                  <span className="font-medium">{c.name}</span>
                  <div className="font-mono text-[11px] text-fg-subtle">{c.id.slice(0, 10)}…</div>
                </Td>
                <Td><Link href={`/admin/users/${c.userId}`} className="hover:text-accent hover:underline underline-offset-4">{c.user.username}</Link></Td>
                <Td className="whitespace-nowrap">{getTool(c.toolSlug)?.name ?? c.toolSlug}</Td>
                <Td><StatusBadge status={c.status} /></Td>
                <Td className="text-right tabular-nums">{c.currentVersion?.version ?? c.exportVersion ?? 0}</Td>
                <Td className="text-right tabular-nums text-fg-muted">{c.currentVersion?.sizeBytes ? formatBytes(c.currentVersion.sizeBytes) : "—"}</Td>
                <Td>
                  {c.showcaseItem ? (
                    <span className="flex items-center gap-1">
                      <StatusBadge status={c.showcaseItem.status} />
                      {c.showcaseItem.featured ? <Badge variant="accent">featured</Badge> : null}
                    </span>
                  ) : <span className="text-fg-subtle">private</span>}
                </Td>
                <Td className="whitespace-nowrap text-fg-muted" title={formatDateTime(c.updatedAt)}>{timeAgo(c.updatedAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/creations", sp, { page: p })} />
    </div>
  );
}
