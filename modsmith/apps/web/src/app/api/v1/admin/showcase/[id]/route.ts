import { z } from "zod";
import { prisma } from "@modsmith/db";
import { audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { MOD } from "../../_lib";

export const PATCH = apiRoute({ ...MOD, body: z.object({ status: z.enum(["PUBLISHED", "HIDDEN", "REMOVED"]).optional(), featured: z.boolean().optional() }) }, async ({ user, params, body, ip, userAgent }) => {
  const i = await prisma.showcaseItem.update({ where: { id: params.id }, data: body });
  if (body.status && body.status !== "PUBLISHED") await prisma.creation.update({ where: { id: i.creationId }, data: { isPublic: false } });
  await audit({ actorId: user!.id, actorType: "admin", action: "admin.showcase.moderate", targetType: "showcase", targetId: i.id, after: body, ip, userAgent });
  return json(i);
});
