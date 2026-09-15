import { NextResponse } from "next/server";
import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { storage, audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "required" }, async ({ user, params, req }) => {
  const j = await prisma.processingJob.findFirst({ where: { id: params.id, userId: user!.id, status: "COMPLETED" } });
  if (!j?.resultKey) throw new ApiFailure(ErrorCodes.NOT_FOUND, "No downloadable result", 404);
  const url = await storage().signedGetUrl(j.resultKey, { ttl: 300, downloadName: j.resultName ?? "resource.zip", mime: "application/zip" });
  await audit({ actorId: user!.id, action: "job.download", targetType: "job", targetId: j.id });
  if (req.nextUrl.searchParams.get("redirect") === "1") return NextResponse.redirect(url);
  return json({ url, fileName: j.resultName, expiresIn: 300 });
});
