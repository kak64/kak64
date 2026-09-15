import { forgotSchema } from "@modsmith/core";
import { RATE_LIMITS } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { requestPasswordReset } from "@/server/auth";

export const POST = apiRoute({ auth: "none", body: forgotSchema, rateLimit: ({ ip }) => ({ rule: RATE_LIMITS.forgot, subject: ip ?? "anon" }) }, async ({ body }) => {
  await requestPasswordReset(body.email);
  // Always the same response — never reveal whether the email exists.
  return json({ ok: true, message: "If an account exists for that email, a reset link has been sent." });
});
