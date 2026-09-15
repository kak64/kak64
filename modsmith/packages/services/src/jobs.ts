import { prisma, type JobStatus, type Prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, TOOL_CONFIG_SCHEMAS, canonicalize, getTool, stripNonSemantic, type JobStage } from "@modsmith/core";
import { sha256 } from "./crypto";
import { applyLedgerEntry } from "./credits";
import { redis } from "./redis";
import { env } from "./env";
import { getEffectiveTool, getSetting } from "./settings";
import { enqueue, queueForProcessor } from "./queue";
import { notify } from "./notifications";
import { audit } from "./audit";
import { logger } from "./logger";
import { storage } from "./storage";

export interface JobEstimate {
  toolSlug: string;
  baseCost: number;
  discountPct: number;
  credits: number;
  freeReexport: boolean;
  reexportUntil: string | null;
  freeDailyRemaining: number | null;
  sourceHash: string;
  configHash: string;
  balance: number;
  canAfford: boolean;
}

async function activeCreatorSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] }, plan: { kind: "CREATOR" }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }, { graceUntil: { gt: new Date() } }] },
    include: { plan: true },
  });
}

export function computeHashes(toolSlug: string, uploads: { sha256: string | null; id: string }[], config: Record<string, unknown>, externalRef?: { provider: string; id: string }) {
  const sourceParts = uploads.map((u) => u.sha256 ?? `id:${u.id}`).sort();
  if (externalRef) sourceParts.push(`${externalRef.provider}:${externalRef.id}`);
  const sourceHash = sha256(`${toolSlug}|${sourceParts.join("|")}`);
  const configHash = sha256(canonicalize(stripNonSemantic(config)));
  return { sourceHash, configHash };
}

/** Validate gating + compute the cost of a job before it is created. */
export async function estimateJob(opts: { userId: string; emailVerified: boolean; toolSlug: string; uploadIds: string[]; config: Record<string, unknown>; externalRef?: { provider: string; id: string }; purpose?: "export" | "inspect" }): Promise<JobEstimate & { uploads: { id: string; sha256: string | null; storageKey: string; originalName: string; sizeBytes: bigint; detectedMime: string | null }[] }> {
  const tool = await getEffectiveTool(opts.toolSlug);
  if (!tool || !tool.enabled || tool.status === "coming_soon" || tool.status === "maintenance") throw new ApiFailure(ErrorCodes.TOOL_DISABLED, "This tool is not available right now", 403);
  if (tool.requiresVerification && !opts.emailVerified) throw new ApiFailure(ErrorCodes.EMAIL_NOT_VERIFIED, "Verify your email to use this tool", 403);
  const sub = await activeCreatorSubscription(opts.userId);
  if (tool.requiresSubscription && !sub) throw new ApiFailure(ErrorCodes.SUBSCRIPTION_REQUIRED, "This tool requires an active subscription", 403);
  if (tool.slug === "ai-prop-creator" && !sub?.plan.aiTools) {
    // AI tools are available to everyone on credits unless the tool is flagged as subscription-only; keep gating configurable.
  }

  const inspect = opts.purpose === "inspect";
  const schema = TOOL_CONFIG_SCHEMAS[opts.toolSlug];
  const config = schema && !inspect ? (schema.parse(opts.config) as Record<string, unknown>) : opts.config;

  const uploads = opts.uploadIds.length
    ? await prisma.assetUpload.findMany({ where: { id: { in: opts.uploadIds }, userId: opts.userId, status: { in: ["UPLOADED", "VALIDATED"] }, deletedAt: null }, select: { id: true, sha256: true, storageKey: true, originalName: true, sizeBytes: true, detectedMime: true, expiresAt: true } })
    : [];
  if (uploads.length !== opts.uploadIds.length) throw new ApiFailure(ErrorCodes.INVALID_FILE, "One or more uploads are missing, expired or not yours", 400);
  for (const u of uploads) {
    if (u.expiresAt < new Date()) throw new ApiFailure(ErrorCodes.UPLOAD_EXPIRED, "An upload has expired. Upload it again.", 400);
    // Large uploads are hashed by a worker; without the hash we cannot decide the free re-export window,
    // so the job waits rather than silently charging (or not charging) the wrong amount.
    if (!u.sha256) throw new ApiFailure(ErrorCodes.INVALID_FILE, "This upload is still being verified. Try again in a moment.", 409, { finalizing: true, uploadId: u.id });
  }

  const { sourceHash, configHash } = computeHashes(opts.toolSlug, uploads, config, opts.externalRef);
  const windowDays = await getSetting<number>("credits.reexportWindowDays");
  const since = new Date(Date.now() - windowDays * 86400_000);
  const prior = await prisma.exportCharge.findFirst({ where: { userId: opts.userId, toolSlug: opts.toolSlug, sourceHash, configHash, createdAt: { gte: since }, job: { status: "COMPLETED" } }, orderBy: { createdAt: "asc" } });
  const freeReexport = !!prior;
  const reexportUntil = prior ? new Date(prior.createdAt.getTime() + windowDays * 86400_000).toISOString() : null;

  // Free daily allowance (e.g. face creator)
  let freeDailyRemaining: number | null = null;
  const dailyAllowance = sub?.plan.faceDailyExports && tool.slug === "face-skin-creator" ? sub.plan.faceDailyExports : (tool.freeDailyExports ?? 0);
  if (dailyAllowance > 0) {
    const day = new Date().toISOString().slice(0, 10);
    const usage = await prisma.dailyToolUsage.findUnique({ where: { userId_toolSlug_day: { userId: opts.userId, toolSlug: tool.slug, day } } });
    freeDailyRemaining = Math.max(0, dailyAllowance - (usage?.count ?? 0));
  }

  const discountPct = sub?.plan.exportDiscountPct ?? 0;
  let credits = Math.max(0, Math.ceil(tool.creditCost * (1 - discountPct / 100)));
  if (inspect || freeReexport || (freeDailyRemaining !== null && freeDailyRemaining > 0)) credits = 0;
  const account = await prisma.creditAccount.findUnique({ where: { userId: opts.userId } });
  const balance = account?.balance ?? 0;
  return { toolSlug: tool.slug, baseCost: tool.creditCost, discountPct, credits, freeReexport, reexportUntil, freeDailyRemaining, sourceHash, configHash, balance, canAfford: balance >= credits, uploads: uploads.map(({ expiresAt: _e, ...u }) => u) };
}

export async function createJob(opts: {
  userId: string;
  emailVerified: boolean;
  toolSlug: string;
  uploadIds: string[];
  config: Record<string, unknown>;
  name?: string;
  creationId?: string;
  externalRef?: { provider: string; id: string; url?: string };
  purpose?: "export" | "inspect";
  ip?: string | null;
  userAgent?: string | null;
}) {
  const tool = getTool(opts.toolSlug);
  if (!tool) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Unknown tool", 404);
  const inspect = opts.purpose === "inspect";
  const est = await estimateJob(opts);
  if (!est.canAfford) throw new ApiFailure(ErrorCodes.INSUFFICIENT_CREDITS, `This export costs ${est.credits} credits; you have ${est.balance}.`, 402, { needed: est.credits, balance: est.balance });
  const schema = TOOL_CONFIG_SCHEMAS[opts.toolSlug];
  const config = schema && !inspect ? (schema.parse(opts.config) as Record<string, unknown>) : opts.config;

  const name = opts.name?.trim() || est.uploads[0]?.originalName?.replace(/\.[^.]+$/, "") || `${tool.name} ${new Date().toISOString().slice(0, 10)}`;

  const job = await prisma.$transaction(async (tx) => {
    let creationId = opts.creationId ?? null;
    if (creationId) {
      const c = await tx.creation.findFirst({ where: { id: creationId, userId: opts.userId, deletedAt: null } });
      if (!c) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Creation not found", 404);
    } else {
      const c = await tx.creation.create({ data: { userId: opts.userId, toolSlug: tool.slug, name, originalFilename: est.uploads[0]?.originalName ?? null, status: inspect ? "DRAFT" : "PROCESSING", uploadId: est.uploads[0]?.id ?? null, config: config as Prisma.InputJsonValue, sourceHash: est.sourceHash, configHash: est.configHash, isPublic: false } });
      creationId = c.id;
    }
    const j = await tx.processingJob.create({
      data: {
        userId: opts.userId,
        toolSlug: tool.slug,
        processor: inspect ? "inspect" : tool.processor,
        status: "PENDING",
        stage: "validation",
        uploadId: est.uploads[0]?.id ?? null,
        creationId,
        input: { files: est.uploads.map((u) => ({ key: u.storageKey, originalName: u.originalName, size: Number(u.sizeBytes), mime: u.detectedMime, sha256: u.sha256 })), externalRef: opts.externalRef ?? null } as Prisma.InputJsonValue,
        config: config as Prisma.InputJsonValue,
        sourceHash: est.sourceHash,
        configHash: est.configHash,
        estimatedCredits: est.credits,
        isFreeReexport: est.freeReexport,
      },
    });
    // Hold credits now (returned automatically on failure/cancel). Row lock prevents overspend races.
    let transactionId: string | null = null;
    if (est.credits > 0) {
      const { transaction } = await applyLedgerEntry({ userId: opts.userId, type: "EXPORT", amount: -est.credits, reason: `${tool.name} export`, referenceType: "job", referenceId: j.id, idempotencyKey: `job-charge:${j.id}` }, tx);
      transactionId = transaction.id;
    }
    if (!inspect) await tx.exportCharge.create({ data: { userId: opts.userId, jobId: j.id, toolSlug: tool.slug, credits: est.credits, wasFreeReexport: est.freeReexport, sourceHash: est.sourceHash, configHash: est.configHash, transactionId } });
    if (!inspect && est.freeDailyRemaining !== null && est.credits === 0 && !est.freeReexport) {
      const day = new Date().toISOString().slice(0, 10);
      await tx.dailyToolUsage.upsert({ where: { userId_toolSlug_day: { userId: opts.userId, toolSlug: tool.slug, day } }, create: { userId: opts.userId, toolSlug: tool.slug, day, count: 1 }, update: { count: { increment: 1 } } });
    }
    await tx.processingJob.update({ where: { id: j.id }, data: { chargedCredits: est.credits, status: "QUEUED" } });
    await tx.creation.update({ where: { id: creationId! }, data: { currentJobId: j.id, status: inspect ? "DRAFT" : "PROCESSING", lastCreditCost: inspect ? undefined : est.credits } });
    await tx.processingEvent.create({ data: { jobId: j.id, status: "QUEUED", stage: "validation", progress: 0, message: inspect ? "Queued — preparing editor preview (free)" : est.credits === 0 ? (est.freeReexport ? "Free re-export — no credits charged" : "Queued (free)") : `Queued — ${est.credits} credits held` } });
    await audit({ actorId: opts.userId, action: "job.create", targetType: "job", targetId: j.id, after: { toolSlug: tool.slug, credits: est.credits, freeReexport: est.freeReexport }, ip: opts.ip, userAgent: opts.userAgent }, tx);
    return j;
  });

  const queued = await enqueue(queueForProcessor(job.processor), job.processor, { jobId: job.id }, { jobId: job.id, priority: inspect ? 1 : job.priority || undefined });
  await prisma.processingJob.update({ where: { id: job.id }, data: { queueJobId: queued.id ?? job.id } });
  await publishJobEvent(job.id, { status: "QUEUED", stage: "validation", progress: 0 });
  return prisma.processingJob.findUniqueOrThrow({ where: { id: job.id } });
}

export async function publishJobEvent(jobId: string, event: { status?: JobStatus; stage?: string; progress?: number; message?: string; level?: string; data?: unknown }) {
  try { await redis().publish(`job:${jobId}`, JSON.stringify({ jobId, at: Date.now(), ...event })); } catch { /* ignore */ }
}

export async function recordJobProgress(jobId: string, p: { stage?: JobStage | string; progress?: number; message?: string; level?: string; data?: Prisma.InputJsonValue }) {
  await prisma.$transaction([
    prisma.processingJob.update({ where: { id: jobId }, data: { stage: p.stage, progress: p.progress, status: "PROCESSING" } }),
    prisma.processingEvent.create({ data: { jobId, status: "PROCESSING", stage: p.stage, progress: p.progress, message: p.message, level: p.level ?? "info", data: p.data } }),
  ]);
  await publishJobEvent(jobId, { status: "PROCESSING", ...p, data: undefined });
}

/** Called by the worker on success. Creates the immutable CreationVersion and notifies. */
export async function completeJob(jobId: string, result: { resultKey: string; resultName: string; resultSize: number; sha256: string; manifest: Record<string, unknown>; thumbnailKey?: string | null; facts?: Record<string, unknown> }) {
  const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId }, include: { creation: true } });
  if (job.status === "COMPLETED") return job;
  const tool = getTool(job.toolSlug);
  if (job.processor === "inspect") {
    // Editor preview: keep source uploads (they are needed for the real export), no version, no charge, no email.
    await prisma.$transaction(async (tx) => {
      await tx.processingJob.update({ where: { id: jobId }, data: { status: "COMPLETED", stage: "complete", progress: 100, finishedAt: new Date(), resultKey: result.resultKey, resultName: result.resultName, resultSize: BigInt(result.resultSize), resultManifest: result.manifest as Prisma.InputJsonValue } });
      await tx.processingEvent.create({ data: { jobId, status: "COMPLETED", stage: "complete", progress: 100, message: "Preview ready" } });
      if (job.creationId) {
        const creation = await tx.creation.findUnique({ where: { id: job.creationId } });
        const prev = (creation?.projectState ?? {}) as Record<string, unknown>;
        await tx.creation.update({ where: { id: job.creationId }, data: { status: creation?.currentVersionId ? "READY" : "DRAFT", thumbnailKey: result.thumbnailKey ?? creation?.thumbnailKey ?? null, projectState: { ...prev, preview: { jobId, manifest: result.manifest, facts: result.facts ?? {} } } as Prisma.InputJsonValue } });
      }
    });
    await publishJobEvent(jobId, { status: "COMPLETED", stage: "complete", progress: 100 });
    return job;
  }
  const windowDays = await getSetting<number>("credits.reexportWindowDays");
  await prisma.$transaction(async (tx) => {
    await tx.processingJob.update({ where: { id: jobId }, data: { status: "COMPLETED", stage: "complete", progress: 100, finishedAt: new Date(), resultKey: result.resultKey, resultName: result.resultName, resultSize: BigInt(result.resultSize), resultManifest: result.manifest as Prisma.InputJsonValue } });
    await tx.processingEvent.create({ data: { jobId, status: "COMPLETED", stage: "complete", progress: 100, message: "Build complete" } });
    if (job.creationId) {
      const creation = await tx.creation.findUnique({ where: { id: job.creationId } });
      const version = (creation?.exportVersion ?? 0) + 1;
      const v = await tx.creationVersion.create({ data: { creationId: job.creationId, version, jobId, resourceKey: result.resultKey, resourceName: result.resultName, sizeBytes: BigInt(result.resultSize), sha256: result.sha256, manifest: result.manifest as Prisma.InputJsonValue, creditCost: job.chargedCredits ?? 0, sourceHash: job.sourceHash, configHash: job.configHash } });
      await tx.creation.update({ where: { id: job.creationId }, data: { status: "READY", exportVersion: version, currentVersionId: v.id, thumbnailKey: result.thumbnailKey ?? creation?.thumbnailKey ?? null, metadata: (result.facts ?? {}) as Prisma.InputJsonValue, reexportUntil: new Date(Date.now() + windowDays * 86400_000), sourceHash: job.sourceHash, configHash: job.configHash } });
    }
  });
  // Delete the temporary source upload objects (completed resources are kept).
  const input = job.input as { files?: { key: string }[] };
  for (const f of input.files ?? []) {
    try { await storage().deleteObject(f.key); } catch (err) { logger.warn({ err, key: f.key }, "failed to delete source upload"); }
  }
  if (job.uploadId) await prisma.assetUpload.update({ where: { id: job.uploadId }, data: { status: "DELETED", deletedAt: new Date() } }).catch(() => {});

  await publishJobEvent(jobId, { status: "COMPLETED", stage: "complete", progress: 100 });
  const href = job.creationId ? `/app/creations/${job.creationId}` : `/app/jobs/${jobId}`;
  const name = job.creation?.name ?? result.resultName;
  await notify({ userId: job.userId, type: "JOB_COMPLETED", title: `${name} is ready`, body: `${tool?.name ?? job.toolSlug} finished building.`, href, data: { jobId }, email: { template: "jobCompleted", params: { name, tool: tool?.name ?? job.toolSlug, url: `${env().APP_URL}${href}` } }, discord: true });
  // Referral qualification on first completed export
  const completedCount = await prisma.processingJob.count({ where: { userId: job.userId, status: "COMPLETED" } });
  if (completedCount === 1) {
    const { qualifyReferralIfAny } = await import("./referrals");
    await qualifyReferralIfAny(job.userId, jobId).catch((err) => logger.error({ err }, "referral qualify failed"));
  }
  return job;
}

/** Called by the worker on failure/cancel. Refunds held credits when the failure is ours (infrastructure) or the job never started. */
export async function failJob(jobId: string, failure: { code: string; message: string; infrastructure: boolean; cancelled?: boolean }) {
  const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId }, include: { creation: true, exportCharge: true } });
  if (job.status === "COMPLETED" || job.status === "REFUNDED") return job;
  const tool = getTool(job.toolSlug);
  const shouldRefund = (job.chargedCredits ?? 0) > 0 && (failure.infrastructure || failure.cancelled || true);
  // Policy: any failed job returns credits — the user only pays for a successful build.
  const status: JobStatus = failure.cancelled ? "CANCELLED" : "FAILED";
  await prisma.$transaction(async (tx) => {
    await tx.processingJob.update({ where: { id: jobId }, data: { status, finishedAt: new Date(), errorCode: failure.code, errorMessage: failure.message.slice(0, 1000) } });
    await tx.processingEvent.create({ data: { jobId, status, message: failure.message.slice(0, 1000), level: "error", data: { code: failure.code, infrastructure: failure.infrastructure } } });
    if (job.creationId) await tx.creation.update({ where: { id: job.creationId }, data: { status: job.creation?.currentVersionId ? "READY" : "FAILED" } });
    if (shouldRefund && job.exportCharge) {
      const { transaction, duplicate } = await applyLedgerEntry({ userId: job.userId, type: "FAILED_JOB_REFUND", amount: job.chargedCredits!, reason: failure.cancelled ? "Job cancelled — credits returned" : `Job failed — credits returned (${failure.code})`, referenceType: "job", referenceId: jobId, idempotencyKey: `job-refund:${jobId}` }, tx);
      if (!duplicate) await tx.creditRefund.create({ data: { chargeId: job.exportCharge.id, credits: job.chargedCredits!, reason: failure.code, transactionId: transaction.id } });
      await tx.processingJob.update({ where: { id: jobId }, data: { status: "REFUNDED" } });
    }
  });
  const finalStatus = shouldRefund && job.exportCharge ? "REFUNDED" : status;
  await publishJobEvent(jobId, { status: finalStatus, message: failure.message });
  if (!failure.cancelled) {
    const href = `/app/jobs/${jobId}`;
    const name = job.creation?.name ?? job.toolSlug;
    await notify({ userId: job.userId, type: "JOB_FAILED", title: `${name} failed to build`, body: failure.message.slice(0, 200), href, data: { jobId, code: failure.code }, email: { template: "jobFailed", params: { name, tool: tool?.name ?? job.toolSlug, reason: failure.message.slice(0, 200), refunded: shouldRefund, url: `${env().APP_URL}${href}` } }, discord: true });
  }
  return prisma.processingJob.findUniqueOrThrow({ where: { id: jobId } });
}

export async function cancelJob(jobId: string, userId: string) {
  const job = await prisma.processingJob.findFirst({ where: { id: jobId, userId } });
  if (!job) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Job not found", 404);
  if (!["PENDING", "QUEUED", "PROCESSING"].includes(job.status)) throw new ApiFailure(ErrorCodes.JOB_NOT_CANCELLABLE, "This job can no longer be cancelled", 409);
  try { await redis().set(`job:${jobId}:cancel`, "1", "EX", 3600); } catch { /* ignore */ }
  if (job.status !== "PROCESSING") {
    try { const q = (await import("./queue")).getQueue(queueForProcessor(job.processor)); const bj = await q.getJob(jobId); if (bj) await bj.remove(); } catch { /* may be active */ }
    return failJob(jobId, { code: "CANCELLED", message: "Cancelled by user", infrastructure: false, cancelled: true });
  }
  return job; // worker observes the cancel flag and calls failJob
}

export async function retryJob(jobId: string, actorId: string | null) {
  const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId } });
  if (!["FAILED", "REFUNDED"].includes(job.status)) throw new ApiFailure(ErrorCodes.CONFLICT, "Only failed jobs can be retried", 409);
  const tool = getTool(job.toolSlug)!;
  await prisma.$transaction(async (tx) => {
    // Re-hold credits if the original charge was refunded.
    if (job.status === "REFUNDED" && (job.chargedCredits ?? 0) > 0) {
      await applyLedgerEntry({ userId: job.userId, type: "EXPORT", amount: -(job.chargedCredits ?? 0), reason: `${tool.name} export (retry)`, referenceType: "job", referenceId: jobId, idempotencyKey: `job-charge:${jobId}:retry:${job.attempts + 1}` }, tx);
    }
    await tx.processingJob.update({ where: { id: jobId }, data: { status: "QUEUED", stage: "validation", progress: 0, errorCode: null, errorMessage: null, finishedAt: null, attempts: { increment: 1 } } });
    await tx.processingEvent.create({ data: { jobId, status: "QUEUED", message: "Retried", data: { by: actorId } } });
    if (job.creationId) await tx.creation.update({ where: { id: job.creationId }, data: { status: "PROCESSING", currentJobId: jobId } });
    await audit({ actorId, actorType: actorId ? "admin" : "system", action: "job.retry", targetType: "job", targetId: jobId }, tx);
  });
  await enqueue(queueForProcessor(job.processor), job.processor, { jobId }, { jobId: `${jobId}:r${job.attempts + 1}` });
  await publishJobEvent(jobId, { status: "QUEUED", stage: "validation", progress: 0 });
}
