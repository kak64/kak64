import type { Metadata } from "next";
import { prisma, type Prisma } from "@modsmith/db";
import { TOOLS } from "@modsmith/core";
import { storage } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CreationsList, type CreationFilters } from "@/components/app/creations/creations-list";
import type { CreationRow } from "@/components/app/creations/types";

export const metadata: Metadata = { title: "My Creations" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;
const STATUSES = ["DRAFT", "PROCESSING", "READY", "FAILED", "ARCHIVED"] as const;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CreationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const filters: CreationFilters = { toolSlug: first(sp.toolSlug), status: first(sp.status), from: first(sp.from), to: first(sp.to), q: first(sp.q).slice(0, 100), sort: first(sp.sort) || "newest" };
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const status = STATUSES.includes(filters.status as (typeof STATUSES)[number]) ? (filters.status as (typeof STATUSES)[number]) : undefined;
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : null;
  const where: Prisma.CreationWhereInput = {
    userId: user.id, deletedAt: null,
    ...(filters.toolSlug ? { toolSlug: filters.toolSlug } : {}),
    ...(status ? { status } : {}),
    ...(filters.q ? { name: { contains: filters.q, mode: "insensitive" } } : {}),
    ...(from || to ? { createdAt: { ...(from && !isNaN(+from) ? { gte: from } : {}), ...(to && !isNaN(+to) ? { lte: to } : {}) } } : {}),
  };
  const orderBy: Prisma.CreationOrderByWithRelationInput = filters.sort === "name" ? { name: "asc" } : { createdAt: filters.sort === "oldest" ? "asc" : "desc" };
  const [total, items] = await Promise.all([
    prisma.creation.count({ where }),
    prisma.creation.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { currentVersion: { select: { id: true, version: true, resourceName: true, sizeBytes: true, createdAt: true } }, currentJob: { select: { id: true, status: true, stage: true, progress: true } }, showcaseItem: { select: { slug: true, status: true, title: true, description: true, category: true, tags: true, allowDownload: true, allowRemix: true } } } }),
  ]);
  const s = storage();
  const creations: CreationRow[] = await Promise.all(items.map(async (c) => ({
    id: c.id, name: c.name, toolSlug: c.toolSlug, status: c.status, originalFilename: c.originalFilename, exportVersion: c.exportVersion, lastCreditCost: c.lastCreditCost, reexportUntil: c.reexportUntil?.toISOString() ?? null, isPublic: c.isPublic, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    thumbnailUrl: c.thumbnailKey ? await s.signedGetUrl(c.thumbnailKey, { ttl: 3600 }).catch(() => null) : null,
    currentVersion: c.currentVersion ? { ...c.currentVersion, sizeBytes: Number(c.currentVersion.sizeBytes), createdAt: c.currentVersion.createdAt.toISOString() } : null,
    currentJob: c.currentJob, showcase: c.showcaseItem,
  })));
  const tools = TOOLS.filter((t) => t.category !== "server").map((t) => ({ slug: t.slug, name: t.name }));
  return (
    <div>
      <PageHeader title="My Creations" description="Everything you've built, with versions, downloads and re-export windows." actions={<Button asChild><Link href="/app/tools"><Plus /> New creation</Link></Button>} />
      <CreationsList creations={creations} total={total} page={page} pageSize={PAGE_SIZE} filters={filters} tools={tools} />
    </div>
  );
}
