import { NextResponse } from "next/server";
import { prisma } from "@modsmith/db";
import { redis, workerHeartbeats } from "@modsmith/services";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated liveness/readiness probe for load balancers and container orchestrators.
 * It reports only whether dependencies answer — never counts, names or configuration.
 */
export async function GET() {
  const checks: Record<string, "ok" | "down"> = {};
  const started = Date.now();
  await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => { checks.database = "ok"; }).catch(() => { checks.database = "down"; }),
    redis().ping().then(() => { checks.redis = "ok"; }).catch(() => { checks.redis = "down"; }),
  ]);
  const workers = await workerHeartbeats().catch(() => []);
  checks.workers = workers.some((w) => !w.stale) ? "ok" : "down";
  // Workers being absent does not make the web tier unready — it is reported but not fatal.
  const ready = checks.database === "ok" && checks.redis === "ok";
  return NextResponse.json({ status: ready ? "ok" : "degraded", checks, latencyMs: Date.now() - started }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
