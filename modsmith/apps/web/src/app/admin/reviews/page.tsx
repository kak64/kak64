import Link from "next/link";
import { prisma, type Prisma } from "@modsmith/db";
import { Star } from "lucide-react";
import { getTool } from "@modsmith/core";
import { PageHeader, Pagination } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { StatusTabs } from "@/components/admin/status-tabs";
import { ReviewActions } from "@/components/admin/moderation";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap, ResultCount } from "@/components/admin/table";
import { hrefWith, pageOf, PAGE_SIZE, skipTake, str, type SearchParams } from "@/components/admin/helpers";
import { requireStaff } from "@/components/admin/guard";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-3.5 w-3.5 ${i < rating ? "fill-accent text-accent" : "text-border-strong"}`} aria-hidden />)}
    </span>
  );
}

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = pageOf(sp);
  const status = str(sp, "status") || "PENDING";

  const where: Prisma.ReviewWhereInput = status === "ALL" ? {} : { status: status as Prisma.EnumReviewStatusFilter["equals"] };
  const [total, reviews, counts] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(page), include: { user: { select: { id: true, username: true, email: true } }, creation: { select: { name: true } } } }),
    prisma.review.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countFor = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Reviews" description="Approve reviews before they appear on marketing pages." />
      <StatusTabs current={status} hrefFor={(v) => hrefWith("/admin/reviews", sp, { status: v, page: undefined })}
        tabs={[
          { value: "PENDING", label: "Pending", count: countFor("PENDING") },
          { value: "APPROVED", label: "Approved", count: countFor("APPROVED") },
          { value: "REJECTED", label: "Rejected", count: countFor("REJECTED") },
          { value: "HIDDEN", label: "Hidden", count: countFor("HIDDEN") },
          { value: "ALL", label: "All", count: counts.reduce((a, c) => a + c._count._all, 0) },
        ]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />
      <TableWrap>
        <Table minWidth={980}>
          <THead><Tr><Th>Author</Th><Th>Rating</Th><Th>Review</Th><Th>Subject</Th><Th>Status</Th><Th>Submitted</Th><Th className="text-right">Actions</Th></Tr></THead>
          <TBody>
            {reviews.length === 0 ? <TableEmpty colSpan={7}>No reviews in this state.</TableEmpty> : reviews.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <Link href={`/admin/users/${r.userId}`} className="font-medium hover:text-accent hover:underline underline-offset-4">{r.user.username}</Link>
                  <div className="truncate text-xs text-fg-subtle">{r.user.email}</div>
                </Td>
                <Td><Stars rating={r.rating} /></Td>
                <Td className="max-w-[380px] whitespace-pre-wrap text-fg-muted">{r.text}</Td>
                <Td className="text-fg-muted">{r.creation?.name ?? (r.toolSlug ? getTool(r.toolSlug)?.name ?? r.toolSlug : "—")}</Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td className="whitespace-nowrap text-fg-muted" title={formatDateTime(r.createdAt)}>{timeAgo(r.createdAt)}</Td>
                <Td><ReviewActions id={r.id} status={r.status} /></Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/reviews", sp, { page: p })} />
    </div>
  );
}
