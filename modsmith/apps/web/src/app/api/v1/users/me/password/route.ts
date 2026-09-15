import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, changePasswordSchema } from "@modsmith/core";
import { audit, notify } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { hashPassword, verifyPassword } from "@/server/auth";
import { revokeAllSessions } from "@/server/session";

export const POST = apiRoute({ auth: "required", body: changePasswordSchema }, async ({ user, body, ip, userAgent }) => {
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user!.id } });
  if (!(await verifyPassword(full.passwordHash, body.current))) throw new ApiFailure(ErrorCodes.INVALID_CREDENTIALS, "Current password is incorrect", 401, { current: "Incorrect password" });
  await prisma.user.update({ where: { id: user!.id }, data: { passwordHash: await hashPassword(body.password) } });
  await revokeAllSessions(user!.id, true);
  await audit({ actorId: user!.id, action: "user.password.change", targetType: "user", targetId: user!.id, ip, userAgent });
  await notify({ userId: user!.id, type: "ACCOUNT", title: "Password changed", body: "Other sessions were signed out." });
  return json({ ok: true });
});
