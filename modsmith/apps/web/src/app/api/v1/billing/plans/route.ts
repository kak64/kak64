import { prisma } from "@modsmith/db";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "none" }, async () => {
  const plans = await prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return json({ plans: plans.map((p) => ({ ...p, hubStorageBytes: p.hubStorageBytes ? Number(p.hubStorageBytes) : null })) });
});
