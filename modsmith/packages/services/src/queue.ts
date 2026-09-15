import { Queue, QueueEvents, type JobsOptions } from "bullmq";
import { env } from "./env";

export const QUEUE_NAMES = {
  processing: "processing", // heavy asset jobs
  ai: "ai-generation", // AI provider calls (separate concurrency)
  imports: "external-imports", // gta5-mods / sketchfab fetches
  maintenance: "maintenance", // cleanup, retention, quota
  notifications: "notifications",
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const g = globalThis as unknown as { __queues?: Map<string, Queue>; __queueEvents?: Map<string, QueueEvents> };

export function getQueue(name: QueueName): Queue {
  g.__queues ??= new Map();
  let q = g.__queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: { url: env().REDIS_URL }, defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000, attempts: 1 } });
    g.__queues.set(name, q);
  }
  return q;
}

export function getQueueEvents(name: QueueName): QueueEvents {
  g.__queueEvents ??= new Map();
  let q = g.__queueEvents.get(name);
  if (!q) {
    q = new QueueEvents(name, { connection: { url: env().REDIS_URL } });
    g.__queueEvents.set(name, q);
  }
  return q;
}

export function queueForProcessor(processor: string): QueueName {
  if (processor === "ai-prop") return QUEUE_NAMES.ai;
  if (processor === "car-importer" || processor === "sketchfab") return QUEUE_NAMES.imports;
  return QUEUE_NAMES.processing;
}

export async function enqueue(name: QueueName, jobName: string, data: Record<string, unknown>, opts?: JobsOptions) {
  return getQueue(name).add(jobName, data, opts);
}

export async function queueStats() {
  const out: Record<string, { waiting: number; active: number; delayed: number; failed: number; completed: number }> = {};
  for (const name of Object.values(QUEUE_NAMES)) {
    try {
      const counts = await getQueue(name).getJobCounts("waiting", "active", "delayed", "failed", "completed");
      out[name] = { waiting: counts.waiting ?? 0, active: counts.active ?? 0, delayed: counts.delayed ?? 0, failed: counts.failed ?? 0, completed: counts.completed ?? 0 };
    } catch {
      out[name] = { waiting: -1, active: -1, delayed: -1, failed: -1, completed: -1 };
    }
  }
  return out;
}
