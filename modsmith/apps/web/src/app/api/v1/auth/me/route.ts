import { prisma } from "@modsmith/db";
import { apiRoute, json } from "@/server/api";
import { discordAvatarUrl } from "@modsmith/services";

export const GET = apiRoute({ auth: "optional" }, async ({ user }) => {
  if (!user) return json({ user: null });
  const [account, discord, unread, sub] = await Promise.all([
    prisma.creditAccount.findUnique({ where: { userId: user.id }, select: { balance: true } }),
    prisma.discordConnection.findUnique({ where: { userId: user.id }, select: { discordId: true, username: true, globalName: true, avatarHash: true, connectedAt: true } }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.subscription.findFirst({ where: { userId: user.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] }, plan: { kind: "CREATOR" } }, include: { plan: { select: { name: true, slug: true, exportDiscountPct: true, aiTools: true } } } }),
  ]);
  return json({
    user: { id: user.id, email: user.email, username: user.username, role: user.role, emailVerified: !!user.emailVerifiedAt, avatarUrl: user.avatarUrl, referralCode: user.referralCode, createdAt: user.createdAt },
    credits: account?.balance ?? 0,
    discord: discord ? { ...discord, avatarUrl: discordAvatarUrl(discord.discordId, discord.avatarHash) } : null,
    unreadNotifications: unread,
    subscription: sub ? { id: sub.id, status: sub.status, plan: sub.plan, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd } : null,
  });
});
