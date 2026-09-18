import { cookies, headers } from "next/headers";
import { cache } from "react";
import { prisma, type User } from "@modsmith/db";
import { LIMITS } from "@modsmith/core";
import { hashIp, hmacToken, randomToken } from "@modsmith/services";
import { env, isProd } from "@modsmith/services";

export const SESSION_COOKIE = "ms_session";
export const CSRF_COOKIE = "ms_csrf";

export type SessionUser = Pick<
  User,
  | "id" | "email" | "username" | "role" | "status" | "emailVerifiedAt" | "avatarUrl" | "referralCode"
  | "notifyEmail" | "notifyDiscord" | "notifyJobComplete" | "notifyMarketing" | "profilePublic" | "showcaseDefaultPublic" | "stripeCustomerId" | "createdAt"
>;

const userSelect = {
  id: true, email: true, username: true, role: true, status: true, emailVerifiedAt: true, avatarUrl: true, referralCode: true,
  notifyEmail: true, notifyDiscord: true, notifyJobComplete: true, notifyMarketing: true, profilePublic: true, showcaseDefaultPublic: true, stripeCustomerId: true, createdAt: true,
} as const;

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProd() || env().APP_URL.startsWith("https"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(userId: string, opts: { remember?: boolean; userAgent?: string | null; ip?: string | null }) {
  const token = randomToken(32);
  const days = opts.remember ? LIMITS.SESSION_REMEMBER_TTL_DAYS : LIMITS.SESSION_TTL_DAYS;
  const expiresAt = new Date(Date.now() + days * 86400_000);
  await prisma.session.create({
    data: { userId, tokenHash: hmacToken(token), remember: !!opts.remember, userAgent: opts.userAgent?.slice(0, 255) ?? null, ipHash: hashIp(opts.ip), expiresAt },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(days * 86400));
  // CSRF double-submit token (readable by JS, not HttpOnly)
  jar.set(CSRF_COOKIE, randomToken(24), { ...cookieOptions(days * 86400), httpOnly: false });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return { token, expiresAt };
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({ where: { tokenHash: hmacToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  jar.set(SESSION_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  jar.set(CSRF_COOKIE, "", { ...cookieOptions(0), maxAge: 0, httpOnly: false });
}

export async function revokeAllSessions(userId: string, exceptCurrent = false) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptCurrent && token ? { NOT: { tokenHash: hmacToken(token) } } : {}) },
    data: { revokedAt: new Date() },
  });
}

/** Resolve the current session+user. Cached per request. */
export const getSession = cache(async (): Promise<{ user: SessionUser; sessionId: string } | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hmacToken(token) },
    include: { user: { select: userSelect } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;
  // Touch lastSeenAt at most every 5 minutes
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return { user: session.user, sessionId: session.id };
});

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getSession())?.user ?? null;
}

export async function getRequestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  return { ip, userAgent: h.get("user-agent") };
}
