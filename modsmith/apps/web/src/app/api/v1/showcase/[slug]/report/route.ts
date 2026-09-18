import { z } from "zod";
import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { RATE_LIMITS, postDiscordWebhook } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const POST = apiRoute({ auth: "required", body: z.object({ reason: z.enum(["copyright", "inappropriate", "spam", "other"]), details: z.string().trim().max(1000).optional() }), rateLimit: RATE_LIMITS.report }, async ({ params, user, body }) => {
  const i = await prisma.showcaseItem.findFirst({ where: { slug: params.slug } });
  if (!i) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Not found", 404);
  const r = await prisma.abuseReport.create({ data: { reporterId: user!.id, targetType: "showcase", targetId: i.id, showcaseItemId: i.id, reason: body.reason, details: body.details } });
  await postDiscordWebhook({ title: "New abuse report", description: `Showcase item **${i.title}** reported for ${body.reason}.`, color: 0xef4444 });
  return json({ id: r.id }, { status: 201 });
});
