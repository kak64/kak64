import { prisma } from "@modsmith/db";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "none" }, async () => {
  const [packs, plans] = await Promise.all([
    prisma.creditPack.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return json({ packs, plans: plans.map((p) => ({ ...p, hubStorageBytes: p.hubStorageBytes ? Number(p.hubStorageBytes) : null })) });
});
