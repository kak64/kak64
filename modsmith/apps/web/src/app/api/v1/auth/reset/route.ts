import { resetSchema } from "@modsmith/core";
import { RATE_LIMITS } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { resetPassword } from "@/server/auth";

export const POST = apiRoute({ auth: "none", body: resetSchema, rateLimit: RATE_LIMITS.reset }, async ({ body }) => {
  await resetPassword(body.token, body.password);
  return json({ ok: true });
});
