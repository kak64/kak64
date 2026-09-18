import Link from "next/link";
import { prisma, type Prisma } from "@modsmith/db";
import { storage } from "@modsmith/services";
import { PageHeader, Pagination, Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/admin/filter-bar";
import { DeleteButton } from "@/components/admin/delete-button";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap, ResultCount } from "@/components/admin/table";
import { hrefWith, pageOf, PAGE_SIZE, skipTake, str, type SearchParams } from "@/components/admin/helpers";
import { requireAdmin } from "@/components/admin/guard";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KINDS = ["SCREENSHOT", "PHONE_PHOTO", "PHONE_VIDEO", "OTHER"] as const;

export default async function AdminMediaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = pageOf(sp);
  const kind = str(sp, "kind");
  const projectId = str(sp, "projectId");
  const q = str(sp, "q");

  const where: Prisma.ServerHubMediaWhereInput = {
    deletedAt: null,
    ...(kind ? { kind: kind as Prisma.EnumMediaKindFilter["equals"] } : {}),
    ...(projectId ? { projectId } : {}),
    ...(q ? { OR: [{ playerName: { contains: q, mode: "insensitive" } }, { playerLicense: { contains: q, mode: "insensitive" } }, { project: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };

  const [total, media, totals] = await Promise.all([
    prisma.serverHubMedia.count({ where }),
    prisma.serverHubMedia.findMany({
      where, orderBy: { createdAt: "desc" }, ...skipTake(page),
      include: { project: { select: { id: true, name: true, user: { select: { id: true, username: true } } } } },
    }),
    prisma.serverHubMedia.aggregate({ where: { deletedAt: null }, _sum: { sizeBytes: true }, _count: { _all: true } }),
  ]);

  const signed = await Promise.all(media.map(async (m) => {
    try { return await storage().signedGetUrl(m.storageKey, { ttl: 300, mime: m.mime }); } catch { return null; }
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="Hub media" description="Screenshots and phone media ingested from FiveM servers. View links are signed and expire in 5 minutes." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Objects" value={(totals._count._all ?? 0).toLocaleString("en-US")} />
        <Stat label="Stored" value={formatBytes(totals._sum.sizeBytes ?? 0)} />
        <Stat label="Matching filters" value={total.toLocaleString("en-US")} />
        <Stat label="Page" value={`${page}`} hint={`${PAGE_SIZE} per page`} />
      </div>
      <FilterBar fields={[
        { type: "search", name: "q", placeholder: "Project, player name or license…", label: "Search media" },
        { type: "select", name: "kind", label: "Kind", options: KINDS.map((k) => ({ value: k, label: k.replace(/_/g, " ").toLowerCase() })) },
      ]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />
      <TableWrap>
        <Table minWidth={1040}>
          <THead><Tr><Th>Media</Th><Th>Project</Th><Th>Owner</Th><Th>Kind</Th><Th className="text-right">Size</Th><Th>Dimensions</Th><Th>Player</Th><Th>Captured</Th><Th className="text-right">Actions</Th></Tr></THead>
          <TBody>
            {media.length === 0 ? <TableEmpty colSpan={9}>No media matches these filters.</TableEmpty> : media.map((m, i) => (
              <Tr key={m.id}>
                <Td className="font-mono text-[11px] text-fg-subtle">{m.id.slice(0, 8)}…</Td>
                <Td><Link href={`/admin/media?projectId=${m.projectId}`} className="hover:text-accent hover:underline underline-offset-4">{m.project.name}</Link></Td>
                <Td><Link href={`/admin/users/${m.project.user.id}`} className="hover:text-accent hover:underline underline-offset-4">{m.project.user.username}</Link></Td>
                <Td><Badge variant="outline">{m.kind.replace(/_/g, " ").toLowerCase()}</Badge></Td>
                <Td className="text-right tabular-nums">{formatBytes(m.sizeBytes)}</Td>
                <Td className="text-fg-muted">{m.width && m.height ? `${m.width}×${m.height}` : "—"}</Td>
                <Td className="max-w-[160px] truncate text-fg-muted" title={m.playerLicense ?? ""}>{m.playerName ?? m.playerLicense ?? "—"}</Td>
                <Td className="whitespace-nowrap text-fg-muted" title={formatDateTime(m.createdAt)}>{timeAgo(m.createdAt)}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {signed[i] ? <Button asChild size="sm" variant="outline"><a href={signed[i]!} target="_blank" rel="noreferrer">View</a></Button> : <span className="text-xs text-fg-subtle">unavailable</span>}
                    <DeleteButton endpoint={`/api/v1/admin/media/${m.id}`} title="Delete this media object?"
                      description="The stored file is removed, the record is deleted and the owner's storage quota is credited back. This cannot be undone."
                      success="Media deleted" />
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/media", sp, { page: p })} />
    </div>
  );
}
