import { RATE_LIMITS } from "@modsmith/services";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { apiRoute, json } from "@/server/api";
import { issueVerificationEmail } from "@/server/auth";

export const POST = apiRoute({ auth: "required", rateLimit: RATE_LIMITS.verifyResend }, async ({ user }) => {
  if (user!.emailVerifiedAt) throw new ApiFailure(ErrorCodes.CONFLICT, "Your email is already verified", 409);
  await issueVerificationEmail(user!.id, user!.email, user!.username);
  return json({ ok: true });
});
