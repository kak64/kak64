import { z } from "zod";
import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { RATE_LIMITS, enqueue, QUEUE_NAMES, audit, isFlagEnabled } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

/**
 * Imports a Sketchfab model into the user's uploads via the import worker (download happens off the web request).
 * License metadata is stored and later written into CREDITS.txt inside the exported resource.
 */
export const POST = apiRoute({ auth: "required", requireVerified: true, body: z.object({ modelId: z.string().min(4).max(64), rightsConfirmed: z.literal(true) }), rateLimit: RATE_LIMITS.externalImports }, async ({ user, body, userAgent }) => {
  if (!(await isFlagEnabled("sketchfab_import"))) throw new ApiFailure(ErrorCodes.TOOL_DISABLED, "Model import is disabled", 403);
  await prisma.rightsConfirmation.create({ data: { userId: user!.id, context: "sketchfab", referenceId: body.modelId, statement: "I confirm I will respect the license of this model and include attribution.", userAgent: userAgent?.slice(0, 255) ?? null } });
  const job = await prisma.processingJob.create({ data: { userId: user!.id, toolSlug: "prop-creator", processor: "sketchfab", status: "QUEUED", stage: "importing", input: { externalRef: { provider: "sketchfab", id: body.modelId } }, config: {}, estimatedCredits: 0, chargedCredits: 0 } });
  await enqueue(QUEUE_NAMES.imports, "sketchfab", { jobId: job.id }, { jobId: job.id });
  await audit({ actorId: user!.id, action: "external.sketchfab.import", targetType: "job", targetId: job.id, after: { modelId: body.modelId } });
  return json({ jobId: job.id }, { status: 202 });
});
