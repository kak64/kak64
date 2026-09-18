import { prisma } from "@modsmith/db";
import { env, redis, storage, stripeConfigured, discordConfigured, queueStats } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { ADMIN } from "../_lib";

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; detail?: string }> {
  const t = Date.now();
  try { await fn(); return { ok: true, ms: Date.now() - t }; } catch (e) { return { ok: false, ms: Date.now() - t, detail: String((e as Error).message).slice(0, 200) }; }
}

export const GET = apiRoute(ADMIN, async () => {
  const [database, redisCheck, storageCheck, queues] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`),
    timed(() => redis().ping()),
    timed(async () => { await storage().headObject("healthcheck/none"); }),
    queueStats(),
  ]);
  const heartbeats = await redis().hgetall("workers:heartbeat").catch(() => ({} as Record<string, string>));
  const workers = Object.entries(heartbeats).map(([id, v]) => { const d = JSON.parse(v); return { id, ...d, stale: Date.now() - d.at > 60_000 }; });
  const stripeFailures = await prisma.stripeWebhookEvent.count({ where: { error: { not: null }, createdAt: { gte: new Date(Date.now() - 86400_000) } } });
  const emailFailures = await prisma.emailOutbox.count({ where: { status: "failed", createdAt: { gte: new Date(Date.now() - 86400_000) } } });
  const e = env();
  return json({
    database, redis: redisCheck, storage: { ...storageCheck, provider: e.STORAGE_PROVIDER },
    workers: { ok: workers.some((w) => !w.stale), list: workers },
    queues,
    stripe: { configured: stripeConfigured(), webhookFailures24h: stripeFailures },
    discord: { configured: discordConfigured(), bot: !!e.DISCORD_BOT_TOKEN },
    email: { provider: e.EMAIL_PROVIDER, failures24h: emailFailures },
    ai: { provider: e.AI_3D_PROVIDER, configured: e.AI_3D_PROVIDER === "mock" || !!e.AI_3D_API_KEY },
    version: process.env.APP_VERSION ?? "dev",
  });
});
