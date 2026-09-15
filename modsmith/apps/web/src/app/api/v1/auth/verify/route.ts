import { z } from "zod";
import { RATE_LIMITS } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { verifyEmailToken } from "@/server/auth";

export const POST = apiRoute({ auth: "none", body: z.object({ token: z.string().min(16).max(256) }), rateLimit: RATE_LIMITS.verify }, async ({ body }) => {
  const res = await verifyEmailToken(body.token);
  return json({ verified: true, alreadyVerified: res.alreadyVerified, username: res.user.username });
});
