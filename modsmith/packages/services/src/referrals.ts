import { prisma } from "@modsmith/db";
import { applyLedgerEntry } from "./credits";
import { getSetting } from "./settings";
import { notify } from "./notifications";
import { env } from "./env";

/** Reward the referrer once the referred user completes their first qualifying export. */
export async function qualifyReferralIfAny(referredUserId: string, jobId: string) {
  const conv = await prisma.referralConversion.findUnique({ where: { referredUserId }, include: { referral: true } });
  if (!conv || ["QUALIFIED", "REWARDED", "REJECTED"].includes(conv.status)) return;
  const reward = await getSetting<number>("credits.referralReward");
  const referred = await prisma.user.findUnique({ where: { id: referredUserId }, select: { username: true } });
  await prisma.$transaction(async (tx) => {
    await tx.referralConversion.update({ where: { id: conv.id }, data: { status: "REWARDED", qualifiedAt: new Date(), qualifyingJobId: jobId, rewardedAt: new Date(), rewardCredits: reward } });
    await tx.referral.update({ where: { id: conv.referralId }, data: { qualified: { increment: 1 }, creditsEarned: { increment: reward } } });
    await applyLedgerEntry({ userId: conv.referral.ownerId, type: "REFERRAL_REWARD", amount: reward, reason: `Referral reward: ${referred?.username ?? "user"} built their first asset`, referenceType: "referral", referenceId: conv.id, idempotencyKey: `referral:${conv.id}` }, tx);
  });
  await notify({ userId: conv.referral.ownerId, type: "REFERRAL_REWARD", title: `You earned ${reward} credits`, body: `${referred?.username ?? "A referred user"} built their first asset.`, href: "/app/referrals", email: { template: "referralReward", params: { referred: referred?.username ?? "A user", credits: reward, url: `${env().APP_URL}/app/referrals` } }, discord: true });
}
