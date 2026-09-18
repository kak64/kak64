import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { apiRoute, json } from "@/server/api";
import { MOD, serialize } from "../../_lib";

export const GET = apiRoute(MOD, async ({ params }) => {
  const j = await prisma.processingJob.findUnique({ where: { id: params.id }, include: { events: { orderBy: { createdAt: "asc" } }, user: { select: { id: true, username: true, email: true } }, creation: { select: { id: true, name: true } }, exportCharge: { include: { refunds: true } } } });
  if (!j) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Job not found", 404);
  return json(serialize(j));
});
