import { prisma } from "@modsmith/db";
import { redis } from "./redis";
import { queueStats } from "./queue";

export interface WorkerHeartbeat { id: string; at: number; queues?: string[]; active?: number; stale: boolean }

export async function workerHeartbeats(): Promise<WorkerHeartbeat[]> {
  try {
    const beats = await redis().hgetall("workers:heartbeat");
    return Object.entries(beats).map(([id, raw]) => {
      const parsed = JSON.parse(raw) as { at: number; queues?: string[]; active?: number };
      return { id, ...parsed, stale: Date.now() - parsed.at > 60_000 };
    });
  } catch { return []; }
}

/**
 * Operational counters for the admin health dashboard and the Prometheus endpoint.
 * Everything here is cheap: counts over indexed columns and Redis reads.
 */
export async function collectMetrics() {
  const dayAgo = new Date(Date.now() - 86400_000);
  const hourAgo = new Date(Date.now() - 3600_000);
  const [queues, workers, jobsByStatus, jobs24h, failed24h, durations, users, activeSubs, hubLogs24h, webhookFailures, emailFailures, pendingReviews, openReports] = await Promise.all([
    queueStats(),
    workerHeartbeats(),
    prisma.processingJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.processingJob.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.processingJob.count({ where: { createdAt: { gte: dayAgo }, status: { in: ["FAILED", "REFUNDED"] } } }),
    prisma.$queryRaw<{ p50: number | null; p95: number | null; avg: number | null }[]>`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")))::float AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")))::float AS p95,
        AVG(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")))::float AS avg
      FROM "ProcessingJob"
      WHERE "status" = 'COMPLETED' AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "finishedAt" >= ${dayAgo}`,
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] } } }),
    prisma.serverHubLog.count({ where: { receivedAt: { gte: dayAgo } } }),
    prisma.stripeWebhookEvent.count({ where: { error: { not: null }, createdAt: { gte: dayAgo } } }),
    prisma.emailOutbox.count({ where: { status: "failed", createdAt: { gte: dayAgo } } }),
    prisma.review.count({ where: { status: "PENDING" } }),
    prisma.abuseReport.count({ where: { status: "open" } }),
  ]);
  const activeJobs = jobsByStatus.filter((j) => ["QUEUED", "PROCESSING", "PACKAGING"].includes(j.status)).reduce((a, j) => a + j._count._all, 0);
  const stuck = await prisma.processingJob.count({ where: { status: "PROCESSING", startedAt: { lt: hourAgo } } });
  return {
    queues,
    workers: { total: workers.length, healthy: workers.filter((w) => !w.stale).length, list: workers },
    jobs: { byStatus: Object.fromEntries(jobsByStatus.map((j) => [j.status, j._count._all])), last24h: jobs24h, failed24h, active: activeJobs, stuck, durationSeconds: durations[0] ?? { p50: null, p95: null, avg: null } },
    users, activeSubscriptions: activeSubs, hubLogs24h,
    failures: { stripeWebhooks24h: webhookFailures, emails24h: emailFailures },
    moderation: { pendingReviews, openReports },
  };
}

/** Prometheus text exposition of the same counters. */
export function renderPrometheus(m: Awaited<ReturnType<typeof collectMetrics>>): string {
  const lines: string[] = [];
  const add = (name: string, help: string, type: "gauge" | "counter", samples: [string, number][]) => {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    for (const [labels, value] of samples) lines.push(labels ? `${name}{${labels}} ${value}` : `${name} ${value}`);
  };
  add("modsmith_queue_depth", "Jobs waiting per queue", "gauge", Object.entries(m.queues).map(([q, c]) => [`queue="${q}",state="waiting"`, c.waiting]));
  add("modsmith_queue_active", "Jobs active per queue", "gauge", Object.entries(m.queues).map(([q, c]) => [`queue="${q}"`, c.active]));
  add("modsmith_queue_failed", "Failed jobs retained per queue", "gauge", Object.entries(m.queues).map(([q, c]) => [`queue="${q}"`, c.failed]));
  add("modsmith_workers", "Worker processes", "gauge", [['state="healthy"', m.workers.healthy], ['state="total"', m.workers.total]]);
  add("modsmith_jobs_total", "Processing jobs by status", "gauge", Object.entries(m.jobs.byStatus).map(([s, c]) => [`status="${s}"`, c as number]));
  add("modsmith_jobs_last24h", "Jobs created in the last 24h", "gauge", [["", m.jobs.last24h]]);
  add("modsmith_jobs_failed_last24h", "Jobs failed or refunded in the last 24h", "gauge", [["", m.jobs.failed24h]]);
  add("modsmith_jobs_stuck", "Jobs processing for over an hour", "gauge", [["", m.jobs.stuck]]);
  const d = m.jobs.durationSeconds;
  add("modsmith_job_duration_seconds", "Completed job duration", "gauge", [['quantile="0.5"', d.p50 ?? 0], ['quantile="0.95"', d.p95 ?? 0]]);
  add("modsmith_users_active", "Active user accounts", "gauge", [["", m.users]]);
  add("modsmith_subscriptions_active", "Active subscriptions", "gauge", [["", m.activeSubscriptions]]);
  add("modsmith_hub_logs_last24h", "Server Hub log events ingested in the last 24h", "gauge", [["", m.hubLogs24h]]);
  add("modsmith_failures_last24h", "Integration failures in the last 24h", "gauge", [['kind="stripe_webhook"', m.failures.stripeWebhooks24h], ['kind="email"', m.failures.emails24h]]);
  add("modsmith_moderation_queue", "Items awaiting moderation", "gauge", [['kind="reviews"', m.moderation.pendingReviews], ['kind="reports"', m.moderation.openReports]]);
  return lines.join("\n") + "\n";
}
