import { z } from "zod";
import { prisma } from "@modsmith/db";
import { jobCreateSchema, ApiFailure, ErrorCodes } from "@modsmith/core";
import { RATE_LIMITS, createJob } from "@modsmith/services";
import { apiRoute, json, paginationQuery } from "@/server/api";

const RIGHTS_TOOLS = new Set(["car-importer", "vehicle-editor", "livery-mapper", "retexture", "clothing-textures"]);

export const POST = apiRoute({ auth: "required", body: jobCreateSchema, rateLimit: RATE_LIMITS.jobs }, async ({ user, body, ip, userAgent }) => {
  if (body.purpose !== "inspect" && RIGHTS_TOOLS.has(body.toolSlug) && !body.rightsConfirmed) throw new ApiFailure(ErrorCodes.VALIDATION_ERROR, "Confirm you have the rights to use these files", 400, { rightsConfirmed: "Required" });
  if (body.rightsConfirmed) {
    await prisma.rightsConfirmation.create({ data: { userId: user!.id, context: body.toolSlug, referenceId: body.uploadIds[0] ?? body.externalRef?.id ?? null, statement: "I confirm I own or have permission to use and modify the uploaded/imported files.", userAgent: userAgent?.slice(0, 255) ?? null } });
  }
  const job = await createJob({ userId: user!.id, emailVerified: !!user!.emailVerifiedAt, toolSlug: body.toolSlug, uploadIds: body.uploadIds, config: body.config, name: body.name, creationId: body.creationId, externalRef: body.externalRef, purpose: body.purpose, ip, userAgent });
  return json({ id: job.id, status: job.status, creationId: job.creationId, chargedCredits: job.chargedCredits, isFreeReexport: job.isFreeReexport }, { status: 201 });
});

const listQuery = paginationQuery.extend({ status: z.string().optional(), toolSlug: z.string().optional() });

export const GET = apiRoute({ auth: "required", query: listQuery }, async ({ user, query }) => {
  const where = { userId: user!.id, ...(query.status ? { status: query.status as any } : {}), ...(query.toolSlug ? { toolSlug: query.toolSlug } : {}) };
  const [total, jobs] = await Promise.all([
    prisma.processingJob.count({ where }),
    prisma.processingJob.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, toolSlug: true, status: true, stage: true, progress: true, creationId: true, chargedCredits: true, isFreeReexport: true, errorCode: true, errorMessage: true, resultName: true, resultSize: true, createdAt: true, startedAt: true, finishedAt: true, creation: { select: { name: true } } } }),
  ]);
  return json({ total, page: query.page, pageSize: query.pageSize, jobs: jobs.map((j) => ({ ...j, resultSize: j.resultSize ? Number(j.resultSize) : null })) });
});
