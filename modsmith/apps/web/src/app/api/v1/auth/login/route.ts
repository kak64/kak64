import { loginSchema } from "@modsmith/core";
import { RATE_LIMITS, audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { authenticate } from "@/server/auth";
import { createSession } from "@/server/session";

function safeNext(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

export const POST = apiRoute({ auth: "none", body: loginSchema, rateLimit: ({ ip }) => ({ rule: RATE_LIMITS.login, subject: ip ?? "anon" }) }, async ({ body, ip, userAgent }) => {
  const user = await authenticate(body.identifier, body.password);
  await createSession(user.id, { remember: body.remember, ip, userAgent });
  await audit({ actorId: user.id, action: "auth.login", targetType: "user", targetId: user.id, ip, userAgent });
  return json({ id: user.id, username: user.username, emailVerified: !!user.emailVerifiedAt, role: user.role, redirect: safeNext(body.next) });
});
