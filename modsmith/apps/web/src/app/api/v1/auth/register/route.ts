import { registerSchema } from "@modsmith/core";
import { RATE_LIMITS } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { registerUser } from "@/server/auth";
import { createSession } from "@/server/session";

export const POST = apiRoute({ auth: "none", body: registerSchema, rateLimit: RATE_LIMITS.register }, async ({ body, ip, userAgent }) => {
  const user = await registerUser(body, { ip, userAgent });
  await createSession(user.id, { remember: true, ip, userAgent });
  return json({ id: user.id, username: user.username, email: user.email, emailVerified: false, redirect: "/app?welcome=1" }, { status: 201 });
});
