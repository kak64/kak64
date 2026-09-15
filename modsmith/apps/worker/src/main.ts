import { hostname } from "node:os";
import { mkdir } from "node:fs/promises";
import { Worker, type Job } from "bullmq";
import { QUEUE_NAMES, getQueue, redis } from "@modsmith/services";
import { workerEnv } from "./lib/env";
import { log } from "./lib/log";
import { finalizeUpload, runMaintenance } from "./maintenance";
import { runProcessingJob } from "./runner";

const HEARTBEAT_KEY = "workers:heartbeat";
const MAINTENANCE_SCHEDULER = "maintenance-sweep";

interface QueueSpec {
  name: string;
  concurrency: number;
}

async function handleProcessingJob(job: Job): Promise<unknown> {
  const jobId = (job.data as { jobId?: string }).jobId;
  if (!jobId) {
    log.warn({ queueJob: job.id, name: job.name }, "queue message without a jobId");
    return { status: "skipped" };
  }
  return runProcessingJob(jobId);
}

async function handleMaintenanceJob(job: Job): Promise<unknown> {
  if (job.name === "finalize-upload") {
    const uploadId = (job.data as { uploadId?: string }).uploadId;
    if (!uploadId) return { status: "skipped" };
    return finalizeUpload(uploadId);
  }
  if (job.name === "maintenance" || job.name === MAINTENANCE_SCHEDULER) return runMaintenance();
  log.warn({ name: job.name }, "unknown maintenance job");
  return { status: "skipped" };
}

export async function bootstrap() {
  const env = workerEnv();
  await mkdir(env.tmpDir, { recursive: true });

  const specs: QueueSpec[] = [
    { name: QUEUE_NAMES.processing, concurrency: env.concurrency },
    { name: QUEUE_NAMES.ai, concurrency: 1 },
    { name: QUEUE_NAMES.imports, concurrency: 2 },
    { name: QUEUE_NAMES.maintenance, concurrency: 1 },
  ];

  const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
  const active = new Map<string, number>();
  const workers: Worker[] = [];

  for (const spec of specs) {
    const handler = spec.name === QUEUE_NAMES.maintenance ? handleMaintenanceJob : handleProcessingJob;
    const worker = new Worker(
      spec.name,
      async (job) => {
        active.set(spec.name, (active.get(spec.name) ?? 0) + 1);
        const started = Date.now();
        try {
          return await handler(job);
        } finally {
          active.set(spec.name, Math.max(0, (active.get(spec.name) ?? 1) - 1));
          log.debug({ queue: spec.name, job: job.id, ms: Date.now() - started }, "queue job finished");
        }
      },
      { connection, concurrency: spec.concurrency, lockDuration: 120_000, stalledInterval: 60_000, maxStalledCount: 1 },
    );
    worker.on("failed", (job, err) => log.error({ queue: spec.name, job: job?.id, err: err?.message }, "queue job failed"));
    worker.on("error", (err) => log.error({ queue: spec.name, err: err.message }, "worker error"));
    workers.push(worker);
    log.info({ queue: spec.name, concurrency: spec.concurrency }, "worker started");
  }

  // Repeatable maintenance sweep (idempotent: upsert keeps a single scheduler).
  try {
    await getQueue(QUEUE_NAMES.maintenance).upsertJobScheduler(
      MAINTENANCE_SCHEDULER,
      { every: env.maintenanceEveryMs },
      { name: "maintenance", data: {}, opts: { removeOnComplete: 50, removeOnFail: 100 } },
    );
    log.info({ everyMs: env.maintenanceEveryMs }, "maintenance scheduler registered");
  } catch (err) {
    log.error({ err: (err as Error).message }, "could not register the maintenance scheduler");
  }

  const field = `${hostname()}:${process.pid}`;
  const beat = async () => {
    try {
      await redis().hset(
        HEARTBEAT_KEY,
        field,
        JSON.stringify({ at: Date.now(), queues: specs.map((s) => s.name), active: Object.fromEntries(specs.map((s) => [s.name, active.get(s.name) ?? 0])) }),
      );
    } catch (err) {
      log.warn({ err: (err as Error).message }, "heartbeat failed");
    }
  };
  await beat();
  const heartbeat = setInterval(beat, env.heartbeatMs);
  heartbeat.unref?.();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "shutting down; waiting for active jobs");
    clearInterval(heartbeat);
    await Promise.allSettled(workers.map((w) => w.close()));
    await redis().hdel(HEARTBEAT_KEY, field).catch(() => {});
    // Per-job scratch directories are removed by the runner; the shared tmp root may be
    // in use by another worker on this host, so it is left alone.
    await redis().quit().catch(() => {});
    log.info("shutdown complete");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => log.error({ reason }, "unhandled rejection"));
  process.on("uncaughtException", (err) => log.error({ err }, "uncaught exception"));

  return { workers, shutdown };
}

const isEntry = (() => {
  try {
    const entry = process.argv[1] ?? "";
    return entry.endsWith("main.ts") || entry.endsWith("main.js");
  } catch {
    return false;
  }
})();

if (isEntry) {
  bootstrap().catch((err) => {
    log.error({ err }, "worker failed to start");
    process.exit(1);
  });
}
