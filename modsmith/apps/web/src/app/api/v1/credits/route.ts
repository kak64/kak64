import { prisma } from "@modsmith/db";
import { apiRoute, json } from "@/server/api";
import { getEffectiveTools } from "@modsmith/services";

export const GET = apiRoute({ auth: "required" }, async ({ user }) => {
  const [account, recent, tools] = await Promise.all([
    prisma.creditAccount.findUnique({ where: { userId: user!.id } }),
    prisma.creditTransaction.findMany({ where: { userId: user!.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    getEffectiveTools(),
  ]);
  return json({ balance: account?.balance ?? 0, lifetimeEarned: account?.lifetimeEarned ?? 0, lifetimeSpent: account?.lifetimeSpent ?? 0, recent, toolCosts: tools.map((t) => ({ slug: t.slug, name: t.name, creditCost: t.creditCost })) });
});
