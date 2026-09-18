import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const DELETE = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const s = await prisma.session.findFirst({ where: { id: params.id, userId: user!.id } });
  if (!s) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Session not found", 404);
  await prisma.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
  await audit({ actorId: user!.id, action: "auth.session.revoke", targetType: "session", targetId: s.id });
  return json({ ok: true });
});
