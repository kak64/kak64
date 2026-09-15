import { PageHeader } from "@/components/ui/misc";
import { HealthPanel } from "@/components/admin/health-panel";
import { requireAdmin } from "@/components/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader title="System health" description="Live status of the database, cache, storage, workers, queues and third-party providers." />
      <HealthPanel />
    </div>
  );
}
