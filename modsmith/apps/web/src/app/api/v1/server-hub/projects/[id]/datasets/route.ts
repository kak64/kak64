import { prisma } from "@modsmith/db";
import { apiRoute, json } from "@/server/api";
import { loadOwnedProject } from "@/server/server-hub";

export const GET = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const p = await loadOwnedProject(params.id!, user!.id);
  const datasets = await prisma.serverHubDataset.findMany({ where: { projectId: p.id }, orderBy: { name: "asc" } });
  return json({ datasets });
});
