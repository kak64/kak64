import { expect, type Page, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * E2E helpers. The suite talks to the real app and the real database:
 * verification/reset tokens are only ever stored hashed, so tests mint their own
 * token and rewrite the hash — the same thing the user does by clicking the email link.
 */
export const prisma = new PrismaClient({ datasources: { db: { url: process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL } } });

/**
 * Clears the Redis rate-limit buckets.
 *
 * The suite registers and logs in a dozen accounts from one IP, which legitimately trips the
 * production limiter (5 registrations per hour per IP). The limiter is deliberately left switched
 * on — `01-auth` still asserts that a rate-limited response is surfaced — so the helpers reset the
 * buckets around the flows that would otherwise exhaust them.
 */
export async function resetRateLimits(namespaces = ["register", "login", "jobs", "uploads", "api", "review", "checkout"]) {
  const { default: IORedis } = await import("ioredis");
  const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    for (const ns of namespaces) {
      const keys = await redis.keys(`rl:${ns}:*`);
      if (keys.length) await redis.del(...keys);
    }
  } catch { /* limiter fails open; tests can proceed */ } finally { redis.disconnect(); }
}

export function uniqueUser(prefix = "e2e") {
  const id = `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { username: id, email: `${id}@modsmith.test`, password: "TestPassword123!" };
}

export async function register(page: Page, user: { username: string; email: string; password: string }, opts: { ref?: string } = {}) {
  await resetRateLimits(["register", "api"]);
  await page.goto(opts.ref ? `/register?ref=${opts.ref}` : "/register");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/username/i).fill(user.username);
  await page.getByRole("textbox", { name: /password/i }).fill(user.password);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /create (free )?account|get started|sign up/i }).click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
}

export async function login(page: Page, identifier: string, password: string) {
  await resetRateLimits(["login", "api"]);
  await page.goto("/login");
  await page.getByLabel(/email or username|email/i).first().fill(identifier);
  await page.getByRole("textbox", { name: /password/i }).fill(password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
}

export async function logout(page: Page) {
  await page.request.post("/api/v1/auth/logout", { headers: await csrfHeaders(page) });
  await page.context().clearCookies();
}

/** The API requires a CSRF header matching the ms_csrf cookie for mutations. */
export async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === "ms_csrf")?.value ?? "";
  return { "x-csrf-token": csrf, "content-type": "application/json" };
}

/** Mints a fresh verification token for the user by rewriting the stored hash. */
export async function verifyUserByToken(page: Page, email: string) {
  const { createHmac } = await import("node:crypto");
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET must be set for E2E so tokens can be hashed the same way the app does");
  const user = await prisma.user.findFirstOrThrow({ where: { emailNormalized: email.toLowerCase() } });
  const raw = `e2e-verify-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tokenHash = createHmac("sha256", secret).update(raw).digest("hex");
  await prisma.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.emailVerificationToken.create({ data: { userId: user.id, email: user.email, tokenHash, expiresAt: new Date(Date.now() + 3600_000) } });
  await page.goto(`/verify?token=${raw}`);
  await expect(page.getByText(/verified|email confirmed/i).first()).toBeVisible({ timeout: 20_000 });
}

/**
 * Calls the JSON API as the signed-in user. `request` must be `page.request` — Playwright's
 * standalone `request` fixture has its own cookie jar and would send the call anonymously.
 */
export async function apiJson<T>(request: APIRequestContext, page: Page, method: "post" | "get" | "patch" | "delete", url: string, data?: unknown): Promise<T> {
  const res = await request.fetch(url, { method: method.toUpperCase(), headers: await csrfHeaders(page), data: data === undefined ? undefined : JSON.stringify(data) });
  const body = await res.json();
  if (!body.success) throw new Error(`${method.toUpperCase()} ${url} → ${res.status()} ${body.error?.code}: ${body.error?.message}`);
  return body.data as T;
}

export async function grantCredits(email: string, amount: number) {
  const user = await prisma.user.findFirstOrThrow({ where: { emailNormalized: email.toLowerCase() } });
  const account = await prisma.creditAccount.findUniqueOrThrow({ where: { userId: user.id } });
  await prisma.$transaction([
    prisma.creditAccount.update({ where: { id: account.id }, data: { balance: account.balance + amount, lifetimeEarned: { increment: amount } } }),
    prisma.creditTransaction.create({ data: { accountId: account.id, userId: user.id, type: "ADMIN_ADJUSTMENT", amount, balanceBefore: account.balance, balanceAfter: account.balance + amount, reason: "E2E top-up" } }),
  ]);
}

export async function workerRunning() {
  const { default: IORedis } = await import("ioredis");
  const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    const beats = await redis.hgetall("workers:heartbeat");
    return Object.values(beats).some((v) => { try { return Date.now() - JSON.parse(v).at < 60_000; } catch { return false; } });
  } catch { return false; } finally { redis.disconnect(); }
}
