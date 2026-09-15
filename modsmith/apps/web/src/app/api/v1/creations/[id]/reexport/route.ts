import { z } from "zod";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { createJob, RATE_LIMITS } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { loadOwnedCreation } from "@/server/creations";

/**
 * Re-export a creation. Source uploads are deleted after a successful build, so the user re-uploads the file;
 * if its SHA-256 and the normalized config match a completed export within the free window the job costs 0 credits.
 */
export const POST = apiRoute({ auth: "required", body: z.object({ config: z.record(z.unknown()).optional(), uploadIds: z.array(z.string()).max(32).optional() }), rateLimit: RATE_LIMITS.jobs }, async ({ user, params, body, ip, userAgent }) => {
  const c = await loadOwnedCreation(params.id!, user!.id);
  if (c.currentJob && ["PENDING", "QUEUED", "PROCESSING"].includes(c.currentJob.status)) throw new ApiFailure(ErrorCodes.CONFLICT, "A job is already running for this creation", 409);
  let uploadIds = body.uploadIds ?? [];
  if (!uploadIds.length && c.upload && ["UPLOADED", "VALIDATED"].includes(c.upload.status) && c.upload.expiresAt > new Date()) uploadIds = [c.upload.id];
  if (!uploadIds.length && c.toolSlug !== "chain-creator" && c.toolSlug !== "ai-prop-creator") {
    throw new ApiFailure(ErrorCodes.INVALID_FILE, "Upload the source file again to re-export. Unchanged files with the same settings are free within the re-export window.", 400, { needsUpload: true });
  }
  const job = await createJob({ userId: user!.id, emailVerified: !!user!.emailVerifiedAt, toolSlug: c.toolSlug, uploadIds, config: body.config ?? ((c.config ?? {}) as Record<string, unknown>), creationId: c.id, ip, userAgent });
  return json({ id: job.id, status: job.status, chargedCredits: job.chargedCredits, isFreeReexport: job.isFreeReexport }, { status: 201 });
});
