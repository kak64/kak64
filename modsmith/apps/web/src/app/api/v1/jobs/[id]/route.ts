import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const j = await prisma.processingJob.findFirst({ where: { id: params.id, userId: user!.id }, include: { events: { orderBy: { createdAt: "asc" }, take: 200 }, creation: { select: { id: true, name: true } } } });
  if (!j) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Job not found", 404);
  return json({ ...j, input: undefined, resultSize: j.resultSize ? Number(j.resultSize) : null });
});
