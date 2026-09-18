import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { audit, storage } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "required", query: z.object({ version: z.coerce.number().int().optional(), redirect: z.string().optional() }) }, async ({ user, params, query }) => {
  const c = await prisma.creation.findFirst({ where: { id: params.id, userId: user!.id, deletedAt: null }, include: { currentVersion: true } });
  if (!c) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Creation not found", 404);
  const v = query.version ? await prisma.creationVersion.findFirst({ where: { creationId: c.id, version: query.version } }) : c.currentVersion;
  if (!v) throw new ApiFailure(ErrorCodes.NOT_FOUND, "No exported resource yet", 404);
  const url = await storage().signedGetUrl(v.resourceKey, { ttl: 300, downloadName: v.resourceName, mime: "application/zip" });
  await audit({ actorId: user!.id, action: "creation.download", targetType: "creation", targetId: c.id, after: { version: v.version } });
  if (query.redirect === "1") return NextResponse.redirect(url);
  return json({ url, fileName: v.resourceName, sizeBytes: Number(v.sizeBytes), version: v.version, expiresIn: 300 });
});
