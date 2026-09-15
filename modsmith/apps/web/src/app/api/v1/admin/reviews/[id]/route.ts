import { z } from "zod";
import { prisma } from "@modsmith/db";
import { audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { MOD } from "../../_lib";

export const PATCH = apiRoute({ ...MOD, body: z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED", "HIDDEN"]) }) }, async ({ user, params, body, ip, userAgent }) => {
  const r = await prisma.review.update({ where: { id: params.id }, data: { status: body.status, moderatedById: user!.id, moderatedAt: new Date() } });
  await audit({ actorId: user!.id, actorType: "admin", action: "admin.review.moderate", targetType: "review", targetId: r.id, after: { status: body.status }, ip, userAgent });
  return json(r);
});
export const DELETE = apiRoute(MOD, async ({ user, params, ip, userAgent }) => {
  await prisma.review.delete({ where: { id: params.id } });
  await audit({ actorId: user!.id, actorType: "admin", action: "admin.review.delete", targetType: "review", targetId: params.id, ip, userAgent });
  return json({ ok: true });
});
