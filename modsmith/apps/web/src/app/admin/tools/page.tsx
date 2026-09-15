import { prisma } from "@modsmith/db";
import { PageHeader } from "@/components/ui/misc";
import { ToolsTable } from "@/components/admin/tools-table";
import { requireAdmin } from "@/components/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminToolsPage() {
  await requireAdmin();
  const tools = await prisma.toolConfig.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <div className="space-y-4">
      <PageHeader title="Tools" description="Credit cost, availability and gating per tool. Saving a row invalidates the tool cache." />
      <ToolsTable tools={tools.map((t) => ({ slug: t.slug, name: t.name, category: t.category, creditCost: t.creditCost, status: t.status, enabled: t.enabled, requiresSubscription: t.requiresSubscription, requiresVerification: t.requiresVerification, freeDailyExports: t.freeDailyExports }))} />
    </div>
  );
}
