import type { Metadata } from "next";
import { prisma } from "@modsmith/db";
import { getCurrentUser } from "@/server/session";
import { PageHeader } from "@/components/ui/misc";
import { HubNav } from "@/components/app/hub/hub-nav";
import { LogsExplorer, type HubServerOption } from "@/components/app/hub/logs-explorer";

export const metadata: Metadata = { title: "Server logs" };
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function HubLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const projects = await prisma.serverHubProject.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: "asc" }, include: { datasets: { select: { name: true }, orderBy: { name: "asc" } } } });
  const servers: HubServerOption[] = projects.map((p) => ({ id: p.id, name: p.name, datasets: p.datasets.map((d) => d.name) }));
  const requested = first(sp.server);
  const initialServerId = servers.some((s) => s.id === requested) ? requested : servers[0]?.id ?? "";
  return (
    <div>
      <PageHeader title="Logs" description="Search every event your servers send, across datasets, resources and players." />
      <HubNav />
      <LogsExplorer servers={servers} initialServerId={initialServerId} initialDataset={first(sp.dataset)} />
    </div>
  );
}
