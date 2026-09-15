import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, adminCreditAdjustSchema } from "@modsmith/core";
import { applyLedgerEntry, audit, notify } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { ADMIN } from "../../_lib";

export const POST = apiRoute({ ...ADMIN, body: adminCreditAdjustSchema }, async ({ user, body, ip, userAgent }) => {
  const target = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!target) throw new ApiFailure(ErrorCodes.NOT_FOUND, "User not found", 404);
  const { transaction } = await applyLedgerEntry({ userId: body.userId, type: "ADMIN_ADJUSTMENT", amount: body.amount, reason: body.reason, referenceType: "admin", referenceId: user!.id, createdById: user!.id });
  await audit({ actorId: user!.id, actorType: "admin", action: "admin.credits.adjust", targetType: "user", targetId: body.userId, after: { amount: body.amount, reason: body.reason, transactionId: transaction.id }, ip, userAgent });
  if (body.amount > 0) await notify({ userId: body.userId, type: "ACCOUNT", title: `${body.amount} credits added`, body: body.reason, href: "/app/credits" });
  return json({ transaction });
});
