import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@modsmith/db";
import { LocalProvider, env, hashObject, storage } from "@modsmith/services";
import { log } from "./lib/log";

export interface MaintenanceReport {
  expiredUploads: number;
  expiredReservations: number;
  deletedLogs: number;
  deletedMedia: number;
  orphanObjects: number;
  purgedSessions: number;
  purgedOutbox: number;
  errors: string[];
}

const LOG_BATCH = 5_000;

/** Periodic housekeeping (runs every 15 minutes from the maintenance queue). */
export async function runMaintenance(): Promise<MaintenanceReport> {
  const report: MaintenanceReport = { expiredUploads: 0, expiredReservations: 0, deletedLogs: 0, deletedMedia: 0, orphanObjects: 0, purgedSessions: 0, purgedOutbox: 0, errors: [] };
  const now = new Date();

  // 1. Expired temporary uploads: remove the object, keep the row as DELETED for audit.
  try {
    const uploads = await prisma.assetUpload.findMany({
      where: { status: { not: "DELETED" }, expiresAt: { lt: now } },
      select: { id: true, storageKey: true },
      take: 1_000,
    });
    for (const u of uploads) {
      await storage().deleteObject(u.storageKey).catch((err) => log.warn({ err, key: u.storageKey }, "could not delete expired upload object"));
      await prisma.assetUpload.update({ where: { id: u.id }, data: { status: "DELETED", deletedAt: now } });
      report.expiredUploads++;
    }
  } catch (err) {
    report.errors.push(`uploads: ${(err as Error).message}`);
  }

  // 2. Stale media reservations.
  try {
    const reservations = await prisma.mediaReservation.findMany({ where: { status: "PENDING", expiresAt: { lt: now } }, select: { id: true, storageKey: true }, take: 1_000 });
    for (const r of reservations) {
      await storage().deleteObject(r.storageKey).catch(() => {});
      await prisma.mediaReservation.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
      report.expiredReservations++;
    }
  } catch (err) {
    report.errors.push(`reservations: ${(err as Error).message}`);
  }

  // 3. Server Hub logs past their retention window (batched so a big backlog cannot lock the table).
  try {
    for (let i = 0; i < 20; i++) {
      const batch = await prisma.serverHubLog.findMany({ where: { expiresAt: { lt: now } }, select: { id: true }, take: LOG_BATCH });
      if (!batch.length) break;
      const { count } = await prisma.serverHubLog.deleteMany({ where: { id: { in: batch.map((b) => b.id) } } });
      report.deletedLogs += count;
      if (batch.length < LOG_BATCH) break;
    }
  } catch (err) {
    report.errors.push(`logs: ${(err as Error).message}`);
  }

  // 4. Server Hub media past retention: delete the object, soft-delete the row, return quota.
  try {
    const media = await prisma.serverHubMedia.findMany({
      where: { deletedAt: null, expiresAt: { lt: now } },
      select: { id: true, storageKey: true, sizeBytes: true, project: { select: { userId: true } } },
      take: 500,
    });
    for (const m of media) {
      await storage().deleteObject(m.storageKey).catch(() => {});
      await prisma.$transaction(async (tx) => {
        await tx.serverHubMedia.update({ where: { id: m.id }, data: { deletedAt: now } });
        await tx.storageQuota.updateMany({ where: { userId: m.project.userId }, data: { usedBytes: { decrement: m.sizeBytes } } });
      });
      report.deletedMedia++;
    }
  } catch (err) {
    report.errors.push(`media: ${(err as Error).message}`);
  }

  // 5. Orphaned `uploads/` objects (local provider only — S3 lifecycle rules handle this remotely).
  try {
    report.orphanObjects = await sweepLocalOrphans();
  } catch (err) {
    report.errors.push(`orphans: ${(err as Error).message}`);
  }

  // 6. Sessions expired more than 30 days ago.
  try {
    const cutoff = new Date(now.getTime() - 30 * 86_400_000);
    const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    report.purgedSessions = count;
  } catch (err) {
    report.errors.push(`sessions: ${(err as Error).message}`);
  }

  // 7. Email outbox older than 90 days.
  try {
    const cutoff = new Date(now.getTime() - 90 * 86_400_000);
    const { count } = await prisma.emailOutbox.deleteMany({ where: { createdAt: { lt: cutoff } } });
    report.purgedOutbox = count;
  } catch (err) {
    report.errors.push(`outbox: ${(err as Error).message}`);
  }

  log.info({ ...report }, "maintenance sweep complete");
  return report;
}

/** Remove `uploads/` objects with no live AssetUpload row (local storage only). */
async function sweepLocalOrphans(): Promise<number> {
  if (env().STORAGE_PROVIDER !== "local") return 0;
  const provider = storage();
  if (!(provider instanceof LocalProvider)) return 0;
  const root = path.join(provider.root, "uploads");
  let removed = 0;
  let userDirs: string[];
  try {
    userDirs = await readdir(root);
  } catch {
    return 0;
  }
  const cutoff = Date.now() - 24 * 3_600_000;
  for (const userId of userDirs) {
    let idDirs: string[];
    try {
      idDirs = await readdir(path.join(root, userId));
    } catch {
      continue;
    }
    for (const uploadId of idDirs) {
      const dir = path.join(root, userId, uploadId);
      const st = await stat(dir).catch(() => null);
      if (!st || st.mtimeMs > cutoff) continue;
      const live = await prisma.assetUpload.findFirst({ where: { id: uploadId, status: { not: "DELETED" } }, select: { id: true } });
      if (live) continue;
      for (const name of await readdir(dir).catch(() => [])) {
        await storage().deleteObject(`uploads/${userId}/${uploadId}/${name}`).catch(() => {});
        removed++;
      }
    }
  }
  return removed;
}

export interface FinalizeUploadResult {
  status: "uploaded" | "rejected" | "skipped";
  reason?: string;
  sha256?: string;
}

/**
 * `finalize-upload` job: hash a large upload that the web layer deferred, verify the byte
 * count against the declared size and flip the row to UPLOADED (or REJECTED on a mismatch).
 */
export async function finalizeUpload(uploadId: string): Promise<FinalizeUploadResult> {
  const upload = await prisma.assetUpload.findUnique({ where: { id: uploadId }, select: { id: true, storageKey: true, sizeBytes: true, status: true, sha256: true, originalName: true } });
  if (!upload) return { status: "skipped", reason: "upload not found" };
  if (upload.status === "DELETED" || upload.status === "REJECTED") return { status: "skipped", reason: `upload is ${upload.status}` };
  if (upload.status === "UPLOADED" || upload.status === "VALIDATED") {
    if (upload.sha256) return { status: "skipped", reason: "already finalized", sha256: upload.sha256 };
  }

  const hashed = await hashObject(upload.storageKey);
  if (!hashed) {
    await prisma.assetUpload.update({ where: { id: uploadId }, data: { status: "REJECTED", rejectReason: "The uploaded object is missing from storage" } });
    return { status: "rejected", reason: "object missing" };
  }
  const declared = Number(upload.sizeBytes);
  if (hashed.size !== declared) {
    await prisma.assetUpload.update({
      where: { id: uploadId },
      data: { status: "REJECTED", rejectReason: `Upload is incomplete: expected ${declared} bytes, stored ${hashed.size}` },
    });
    log.warn({ uploadId, declared, actual: hashed.size }, "rejected upload with size mismatch");
    return { status: "rejected", reason: "size mismatch" };
  }
  await prisma.assetUpload.update({ where: { id: uploadId }, data: { status: "UPLOADED", sha256: hashed.sha256, scanStatus: "pending", rejectReason: null } });
  log.info({ uploadId, bytes: hashed.size }, "finalized deferred upload");
  return { status: "uploaded", sha256: hashed.sha256 };
}
