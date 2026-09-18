import type { Metadata } from "next";
import { prisma } from "@modsmith/db";
import { getCurrentUser } from "@/server/session";
import { PageHeader } from "@/components/ui/misc";
import { HubNav } from "@/components/app/hub/hub-nav";
import { MediaGallery } from "@/components/app/hub/media-gallery";
import type { HubServerOption } from "@/components/app/hub/logs-explorer";

export const metadata: Metadata = { title: "Server media" };
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function HubMediaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const projects = await prisma.serverHubProject.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const servers: HubServerOption[] = projects.map((p) => ({ id: p.id, name: p.name, datasets: [] }));
  const requested = first(sp.server);
  const initialServerId = servers.some((s) => s.id === requested) ? requested : servers[0]?.id ?? "";
  return (
    <div>
      <PageHeader title="Media" description="Screenshots and phone media captured on your servers. Files stay private — links expire." />
      <HubNav />
      <MediaGallery servers={servers} initialServerId={initialServerId} />
    </div>
  );
}
