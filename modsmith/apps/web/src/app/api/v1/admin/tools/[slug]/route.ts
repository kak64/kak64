import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, adminToolUpdateSchema } from "@modsmith/core";
import { audit, invalidateCache } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { ADMIN } from "../../_lib";

export const PATCH = apiRoute({ ...ADMIN, body: adminToolUpdateSchema }, async ({ user, params, body, ip, userAgent }) => {
  const before = await prisma.toolConfig.findUnique({ where: { slug: params.slug } });
  if (!before) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Tool not found", 404);
  const tool = await prisma.toolConfig.update({ where: { slug: params.slug }, data: body });
  await invalidateCache("tools");
  await audit({ actorId: user!.id, actorType: "admin", action: "admin.tool.update", targetType: "tool", targetId: params.slug, before: { creditCost: before.creditCost, status: before.status, enabled: before.enabled }, after: body, ip, userAgent });
  return json(tool);
});
