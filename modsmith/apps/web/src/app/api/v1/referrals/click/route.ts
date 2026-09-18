import { z } from "zod";
import { prisma } from "@modsmith/db";
import { RATE_LIMITS } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

/** Tracks a referral link click (rate-limited per IP; deduped per code+ip within the window). */
export const POST = apiRoute({ auth: "none", body: z.object({ code: z.string().max(64) }), rateLimit: ({ ip }) => ({ rule: RATE_LIMITS.referralClick, subject: ip ?? "anon" }) }, async ({ body }) => {
  await prisma.referral.updateMany({ where: { code: { equals: body.code, mode: "insensitive" } }, data: { clicks: { increment: 1 } } });
  const partner = await prisma.partner.findFirst({ where: { referralCode: { equals: body.code, mode: "insensitive" }, active: true } });
  if (partner) await prisma.partnerReferral.create({ data: { partnerId: partner.id, event: "click" } });
  return json({ ok: true });
});
