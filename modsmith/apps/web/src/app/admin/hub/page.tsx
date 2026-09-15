import Link from "next/link";
import { prisma, type Prisma } from "@modsmith/db";
import { Server } from "lucide-react";
import { PageHeader, Pagination, Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FilterBar } from "@/components/admin/filter-bar";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap, ResultCount } from "@/components/admin/table";
import { hrefWith, pageOf, PAGE_SIZE, skipTake, str, type SearchParams } from "@/components/admin/helpers";
import { requireAdmin } from "@/components/admin/guard";
import { formatBytes, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminHubPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = pageOf(sp);
  const q = str(sp, "q");
  const framework = str(sp, "framework");

  const where: Prisma.ServerHubProjectWhereInput = {
    deletedAt: null,
    ...(framework ? { framework } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { user: { username: { contains: q, mode: "insensitive" } } }] } : {}),
  };

  const [total, projects, mediaTotals, logCount] = await Promise.all([
    prisma.serverHubProject.count({ where }),
    prisma.serverHubProject.findMany({
      where, orderBy: { createdAt: "desc" }, ...skipTake(page),
      include: { user: { select: { id: true, username: true, storageQuota: { select: { usedBytes: true, limitBytes: true, retentionDays: true } } } }, _count: { select: { logs: true, media: true, tokens: true } } },
    }),
    prisma.serverHubMedia.aggregate({ where: { deletedAt: null }, _sum: { sizeBytes: true }, _count: { _all: true } }),
    prisma.serverHubLog.count(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Server Hub" description="Projects ingesting logs and media, with the owner's storage quota." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Projects" value={total.toLocaleString("en-US")} icon={Server} />
        <Stat label="Log events" value={logCount.toLocaleString("en-US")} hint="retained across all projects" />
        <Stat label="Media objects" value={(mediaTotals._count._all ?? 0).toLocaleString("en-US")} />
        <Stat label="Media stored" value={formatBytes(mediaTotals._sum.sizeBytes ?? 0)} />
      </div>
      <FilterBar fields={[
        { type: "search", name: "q", placeholder: "Project or owner…", label: "Search projects" },
        { type: "select", name: "framework", label: "Framework", options: [{ value: "standalone", label: "Standalone" }, { value: "esx", label: "ESX" }, { value: "qbcore", label: "QBCore" }, { value: "qbox", label: "Qbox" }] },
      ]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />
      <TableWrap>
        <Table minWidth={980}>
          <THead><Tr><Th>Project</Th><Th>Owner</Th><Th>Framework</Th><Th className="text-right">Logs</Th><Th className="text-right">Media</Th><Th className="text-right">Tokens</Th><Th>Storage used</Th><Th>Created</Th></Tr></THead>
          <TBody>
            {projects.length === 0 ? <TableEmpty colSpan={8}>No Server Hub projects match these filters.</TableEmpty> : projects.map((p) => {
              const quota = p.user.storageQuota;
              const used = Number(quota?.usedBytes ?? 0);
              const limit = Number(quota?.limitBytes ?? 0);
              const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
              return (
                <Tr key={p.id}>
                  <Td><div className="font-medium">{p.name}</div><div className="font-mono text-[11px] text-fg-subtle">{p.slug}</div></Td>
                  <Td><Link href={`/admin/users/${p.userId}`} className="hover:text-accent hover:underline underline-offset-4">{p.user.username}</Link></Td>
                  <Td><Badge variant="outline">{p.framework}</Badge></Td>
                  <Td className="text-right tabular-nums">{p._count.logs.toLocaleString("en-US")}</Td>
                  <Td className="text-right tabular-nums"><Link href={`/admin/media?projectId=${p.id}`} className="hover:text-accent hover:underline">{p._count.media.toLocaleString("en-US")}</Link></Td>
                  <Td className="text-right tabular-nums text-fg-muted">{p._count.tokens}</Td>
                  <Td className="min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <Progress value={pct} className="h-1.5 w-20" indicatorClassName={pct > 90 ? "bg-danger" : pct > 70 ? "bg-warning" : undefined} aria-label={`${pct}% of storage used`} />
                      <span className="whitespace-nowrap text-xs text-fg-muted">{formatBytes(used)}{limit ? ` / ${formatBytes(limit)}` : ""}</span>
                    </div>
                    {quota?.retentionDays ? <div className="text-[11px] text-fg-subtle">{quota.retentionDays}d retention</div> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">{formatDate(p.createdAt)}</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/hub", sp, { page: p })} />
    </div>
  );
}
