import path from "node:path";
import { env } from "@modsmith/services";

/** Worker-only settings (read from process.env; shared settings come from @modsmith/services env()). */
export interface WorkerEnv {
  concurrency: number;
  tmpDir: string;
  codewalkerCli: string | null;
  jobTimeoutMs: number;
  heartbeatMs: number;
  maintenanceEveryMs: number;
  aiProvider: "mock" | "tripo" | "meshy" | "custom";
  aiApiKey: string | null;
  aiEndpoint: string | null;
  sketchfabToken: string | null;
  importAllowlist: string[];
  storageProvider: "s3" | "local";
}

let cached: WorkerEnv | null = null;
export function workerEnv(): WorkerEnv {
  if (cached) return cached;
  const shared = env();
  const concurrency = Math.max(1, Math.min(32, Number.parseInt(process.env.WORKER_CONCURRENCY ?? "2", 10) || 2));
  const tmpDir = path.resolve(process.env.WORKER_TMP_DIR ?? path.join(process.cwd(), "tmp"));
  cached = {
    concurrency,
    tmpDir,
    codewalkerCli: process.env.CODEWALKER_CLI?.trim() || null,
    jobTimeoutMs: Number.parseInt(process.env.WORKER_JOB_TIMEOUT_MS ?? "", 10) || 20 * 60 * 1000,
    heartbeatMs: 15_000,
    maintenanceEveryMs: 15 * 60 * 1000,
    aiProvider: shared.AI_3D_PROVIDER,
    aiApiKey: shared.AI_3D_API_KEY?.trim() || null,
    aiEndpoint: shared.AI_3D_ENDPOINT?.trim() || null,
    sketchfabToken: shared.SKETCHFAB_API_TOKEN?.trim() || null,
    importAllowlist: shared.IMPORT_URL_ALLOWLIST.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    storageProvider: shared.STORAGE_PROVIDER,
  };
  return cached;
}
