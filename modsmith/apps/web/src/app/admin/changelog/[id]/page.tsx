import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@modsmith/db";
import { TOOLS } from "@modsmith/core";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { ChangelogEditor, type ChangelogFormValue } from "@/components/admin/changelog-editor";
import { requireStaff } from "@/components/admin/guard";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit changelog entry", robots: { index: false, follow: false } };

export default async function AdminEditChangelogPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const entry = await prisma.changelogEntry.findUnique({ where: { id } });
  if (!entry) notFound();

  const initial: ChangelogFormValue = {
    id: entry.id, version: entry.version, title: entry.title, category: entry.category as ChangelogFormValue["category"],
    description: entry.description, screenshotKeys: entry.screenshotKeys, toolSlug: entry.toolSlug ?? "",
    state: entry.state, publishedAt: entry.publishedAt ? entry.publishedAt.toISOString() : "",
  };

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/admin/changelog"><ArrowLeft />All entries</Link></Button>
      <PageHeader title={`${entry.version} — ${entry.title}`} description={`Updated ${formatDateTime(entry.updatedAt)}`} />
      <ChangelogEditor tools={TOOLS.map((t) => ({ slug: t.slug, name: t.name }))} initial={initial} />
    </div>
  );
}
