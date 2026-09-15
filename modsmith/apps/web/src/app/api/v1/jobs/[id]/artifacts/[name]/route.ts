import { NextResponse } from "next/server";
import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { storage } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

/**
 * Serves an artifact produced by a job (preview GLB, extracted textures, UV templates, reports).
 * Artifacts are listed in the job's result manifest as { artifacts: [{ name, key, mime, size }] }.
 * ?redirect=1 → 302 to a short-lived signed URL; otherwise returns { url }.
 */
export const GET = apiRoute({ auth: "required" }, async ({ user, params, req }) => {
  const j = await prisma.processingJob.findFirst({ where: { id: params.id, userId: user!.id, status: "COMPLETED" }, select: { resultManifest: true } });
  if (!j) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Job not found", 404);
  const manifest = (j.resultManifest ?? {}) as { artifacts?: { name: string; key: string; mime?: string; size?: number }[] };
  const art = manifest.artifacts?.find((a) => a.name === params.name);
  if (!art) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Artifact not found", 404);
  const url = await storage().signedGetUrl(art.key, { ttl: 900, mime: art.mime });
  if (req.nextUrl.searchParams.get("redirect") === "1") return NextResponse.redirect(url);
  return json({ url, name: art.name, mime: art.mime, size: art.size, expiresIn: 900 });
});
