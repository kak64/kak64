import { z } from "zod";
import { prisma } from "@modsmith/db";
import { audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { MOD } from "../../_lib";

export const PATCH = apiRoute({ ...MOD, body: z.object({ status: z.enum(["open", "resolved", "dismissed"]), hideTarget: z.boolean().optional() }) }, async ({ user, params, body, ip, userAgent }) => {
  const r = await prisma.abuseReport.update({ where: { id: params.id }, data: { status: body.status, resolvedById: user!.id, resolvedAt: new Date() } });
  if (body.hideTarget && r.showcaseItemId) {
    const i = await prisma.showcaseItem.update({ where: { id: r.showcaseItemId }, data: { status: "HIDDEN" } });
    await prisma.creation.update({ where: { id: i.creationId }, data: { isPublic: false } });
  }
  await audit({ actorId: user!.id, actorType: "admin", action: "admin.report.resolve", targetType: "report", targetId: r.id, after: body, ip, userAgent });
  return json(r);
});
