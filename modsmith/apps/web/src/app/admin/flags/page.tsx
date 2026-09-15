import { prisma } from "@modsmith/db";
import { PageHeader } from "@/components/ui/misc";
import { FlagsTable } from "@/components/admin/flags-table";
import { requireAdmin } from "@/components/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminFlagsPage() {
  await requireAdmin();
  const flags = await prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
  return (
    <div className="space-y-4">
      <PageHeader title="Feature flags" description="Runtime switches read by isFlagEnabled(). Values are cached for 30 seconds." />
      <FlagsTable flags={flags.map((f) => ({ key: f.key, description: f.description, enabled: f.enabled, updatedAt: f.updatedAt.toISOString() }))} />
    </div>
  );
}
