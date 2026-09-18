import { z } from "zod";
import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { applyLedgerEntry, audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { ADMIN } from "../../../_lib";

/** Manual refund of a job's charge (e.g. a completed job whose output was unusable). */
export const POST = apiRoute({ ...ADMIN, body: z.object({ reason: z.string().min(3).max(300) }) }, async ({ user, params, body, ip, userAgent }) => {
  const j = await prisma.processingJob.findUnique({ where: { id: params.id }, include: { exportCharge: { include: { refunds: true } } } });
  if (!j) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Job not found", 404);
  const charged = j.chargedCredits ?? 0;
  const refunded = j.exportCharge?.refunds.reduce((a, r) => a + r.credits, 0) ?? 0;
  if (charged - refunded <= 0) throw new ApiFailure(ErrorCodes.CONFLICT, "Nothing left to refund", 409);
  await prisma.$transaction(async (tx) => {
    const { transaction } = await applyLedgerEntry({ userId: j.userId, type: "REFUND", amount: charged - refunded, reason: `Manual refund: ${body.reason}`, referenceType: "job", referenceId: j.id, idempotencyKey: `job-manual-refund:${j.id}`, createdById: user!.id }, tx);
    if (j.exportCharge) await tx.creditRefund.create({ data: { chargeId: j.exportCharge.id, credits: charged - refunded, reason: body.reason, transactionId: transaction.id, createdById: user!.id } });
    if (j.status !== "COMPLETED") await tx.processingJob.update({ where: { id: j.id }, data: { status: "REFUNDED" } });
    await audit({ actorId: user!.id, actorType: "admin", action: "admin.job.refund", targetType: "job", targetId: j.id, after: { credits: charged - refunded, reason: body.reason }, ip, userAgent }, tx);
  });
  return json({ ok: true, credits: charged - refunded });
});
