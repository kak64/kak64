import type { Metadata } from "next";
import Link from "next/link";
import { Images } from "lucide-react";
import { prisma } from "@modsmith/db";
import { TOOLS } from "@modsmith/core";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { EmptyState, Pagination } from "@/components/ui/misc";
import { Container, PageIntro } from "@/components/marketing/section";
import { ShowcaseCard } from "@/components/marketing/showcase-card";
import { showcaseCardSelect, toShowcaseCards } from "@/components/marketing/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Showcase",
  description: "Props, vehicles, liveries, clothing and more — public creations built with Modsmith by the FiveM community.",
  alternates: { canonical: "/showcase" },
  openGraph: { title: "Showcase · Modsmith", description: "Public creations built with Modsmith by the FiveM community.", url: "/showcase" },
};

const PAGE_SIZE = 24;
const SORTS = { recent: "Most recent", popular: "Most viewed", liked: "Most liked" } as const;
type Sort = keyof typeof SORTS;

type Search = Record<string, string | string[] | undefined>;
function one(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v; }

export default async function ShowcasePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const category = one(sp.category)?.trim() || undefined;
  const tool = one(sp.tool)?.trim() || undefined;
  const sortRaw = one(sp.sort);
  const sort: Sort = sortRaw && sortRaw in SORTS ? (sortRaw as Sort) : "recent";
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);

  const where = { status: "PUBLISHED" as const, ...(category ? { category } : {}), ...(tool ? { toolSlug: tool } : {}) };
  const orderBy = sort === "popular" ? { viewCount: "desc" as const } : sort === "liked" ? { likeCount: "desc" as const } : { publishedAt: "desc" as const };
  const [total, rows, categories] = await Promise.all([
    prisma.showcaseItem.count({ where }),
    prisma.showcaseItem.findMany({ where, orderBy: [{ featured: "desc" }, orderBy], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: showcaseCardSelect }),
    prisma.showcaseItem.groupBy({ by: ["category"], where: { status: "PUBLISHED" }, _count: { _all: true }, orderBy: { category: "asc" } }),
  ]);
  const items = await toShowcaseCards(rows);
  const hrefFor = (p: number) => {
    const q = new URLSearchParams();
    if (category) q.set("category", category);
    if (tool) q.set("tool", tool);
    if (sort !== "recent") q.set("sort", sort);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/showcase${s ? `?${s}` : ""}`;
  };
  const filtered = !!(category || tool);

  return (
    <>
      <PageIntro eyebrow="Showcase" title="Built with Modsmith" description="Public creations from the community. Every item was exported through a Modsmith tool; creators choose what to publish and whether downloads are allowed." />
      <Container className="py-10">
        <form method="get" action="/showcase" className="mb-8 grid gap-3 rounded-lg border border-border bg-bg-elevated p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" aria-label="Filter showcase">
          <div className="grid gap-1.5">
            <Label htmlFor="f-category">Category</Label>
            <NativeSelect id="f-category" name="category" defaultValue={category ?? ""}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.category} value={c.category}>{c.category} ({c._count._all})</option>)}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-tool">Tool</Label>
            <NativeSelect id="f-tool" name="tool" defaultValue={tool ?? ""}>
              <option value="">All tools</option>
              {TOOLS.filter((t) => t.category !== "server").map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-sort">Sort</Label>
            <NativeSelect id="f-sort" name="sort" defaultValue={sort}>
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">Apply</Button>
            {filtered || sort !== "recent" ? <Button asChild variant="ghost"><Link href="/showcase">Reset</Link></Button> : null}
          </div>
        </form>
        <p className="mb-4 text-sm text-fg-muted" aria-live="polite">{total.toLocaleString("en-US")} {total === 1 ? "creation" : "creations"}{filtered ? " match your filters" : ""}</p>
        {items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((i) => <ShowcaseCard key={i.slug} item={i} />)}
          </div>
        ) : (
          <EmptyState icon={Images} title={filtered ? "Nothing matches those filters" : "No public creations yet"} description={filtered ? "Try a different category or tool." : "Export something in the workshop and publish it from My Creations to be first."} action={filtered ? { label: "Clear filters", href: "/showcase" } : { label: "Open workshop", href: "/app" }} />
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={hrefFor} />
      </Container>
    </>
  );
}
