import { prisma } from "@modsmith/db";
import { env, getSetting } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "required" }, async ({ user }) => {
  const ref = await prisma.referral.upsert({ where: { ownerId: user!.id }, create: { ownerId: user!.id, code: user!.referralCode }, update: {}, include: { conversions: { orderBy: { createdAt: "desc" }, take: 50, include: { referredUser: { select: { username: true, createdAt: true } } } } } });
  const reward = await getSetting<number>("credits.referralReward");
  return json({ code: ref.code, url: `${env().APP_URL}/register?ref=${encodeURIComponent(ref.code)}`, clicks: ref.clicks, signups: ref.signups, qualified: ref.qualified, creditsEarned: ref.creditsEarned, rewardPerReferral: reward, history: ref.conversions.map((c) => ({ id: c.id, username: c.referredUser.username, status: c.status, signedUpAt: c.createdAt, verifiedAt: c.verifiedAt, qualifiedAt: c.qualifiedAt, rewardCredits: c.rewardCredits })) });
});
