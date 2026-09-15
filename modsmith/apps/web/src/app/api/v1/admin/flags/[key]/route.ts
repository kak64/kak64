import { z } from "zod";
import { prisma } from "@modsmith/db";
import { audit, invalidateCache } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { ADMIN } from "../../_lib";

export const PATCH = apiRoute({ ...ADMIN, body: z.object({ enabled: z.boolean().optional(), description: z.string().max(200).optional() }) }, async ({ user, params, body, ip, userAgent }) => {
  const f = await prisma.featureFlag.upsert({ where: { key: params.key! }, create: { key: params.key!, enabled: body.enabled ?? false, description: body.description }, update: body });
  await invalidateCache("flags");
  await audit({ actorId: user!.id, actorType: "admin", action: "admin.flag.update", targetType: "flag", targetId: params.key, after: body, ip, userAgent });
  return json(f);
});
