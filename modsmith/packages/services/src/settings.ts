import { prisma } from "@modsmith/db";
import { CREDITS, LIMITS, TOOLS, type ToolDefinition } from "@modsmith/core";
import { redis } from "./redis";

const TTL = 30; // seconds

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis().get(`cache:${key}`);
    if (hit) return JSON.parse(hit) as T;
  } catch { /* ignore */ }
  const value = await load();
  try { await redis().set(`cache:${key}`, JSON.stringify(value), "EX", TTL); } catch { /* ignore */ }
  return value;
}

export async function invalidateCache(key: string) {
  try { await redis().del(`cache:${key}`); } catch { /* ignore */ }
}

const DEFAULTS: Record<string, unknown> = {
  "credits.signupBonus": CREDITS.SIGNUP_BONUS,
  "credits.emailVerifyBonus": CREDITS.EMAIL_VERIFY_BONUS,
  "credits.discordBonus": CREDITS.DISCORD_BONUS,
  "credits.referralReward": CREDITS.REFERRAL_REWARD,
  "credits.reexportWindowDays": CREDITS.REEXPORT_WINDOW_DAYS,
  "hub.freeStorageBytes": LIMITS.HUB_FREE_STORAGE_BYTES,
  "hub.defaultRetentionDays": LIMITS.HUB_DEFAULT_RETENTION_DAYS,
  "hub.freeMaxServers": 1,
  "uploads.ttlHours": LIMITS.UPLOAD_TTL_HOURS,
};

export async function getSetting<T = number>(key: string): Promise<T> {
  const all = await cached("settings", async () => {
    const rows = await prisma.systemSetting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });
  return (all[key] ?? DEFAULTS[key]) as T;
}

export async function setSetting(key: string, value: unknown) {
  await prisma.systemSetting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } });
  await invalidateCache("settings");
}

export async function isFlagEnabled(key: string): Promise<boolean> {
  const flags = await cached("flags", async () => {
    const rows = await prisma.featureFlag.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
  });
  return flags[key] ?? false;
}

export type EffectiveTool = ToolDefinition & { enabled: boolean };

/** Tool definitions merged with DB overrides (cost, status, gating). */
export async function getEffectiveTools(): Promise<EffectiveTool[]> {
  const rows = await cached("tools", async () => prisma.toolConfig.findMany());
  const map = new Map(rows.map((r) => [r.slug, r]));
  return TOOLS.map((t) => {
    const r = map.get(t.slug);
    return r
      ? { ...t, creditCost: r.creditCost, status: r.status as ToolDefinition["status"], requiresAuth: r.requiresAuth, requiresSubscription: r.requiresSubscription, requiresVerification: r.requiresVerification, freeDailyExports: r.freeDailyExports || undefined, enabled: r.enabled }
      : { ...t, enabled: true };
  });
}

export async function getEffectiveTool(slug: string): Promise<EffectiveTool | null> {
  return (await getEffectiveTools()).find((t) => t.slug === slug) ?? null;
}
