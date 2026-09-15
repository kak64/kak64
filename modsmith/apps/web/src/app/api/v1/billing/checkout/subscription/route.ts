import { checkoutSubscriptionSchema } from "@modsmith/core";
import { RATE_LIMITS, createSubscriptionCheckout, audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const POST = apiRoute({ auth: "required", body: checkoutSubscriptionSchema, rateLimit: RATE_LIMITS.checkout }, async ({ user, body }) => {
  const res = await createSubscriptionCheckout(user!.id, body.planId, body.interval);
  await audit({ actorId: user!.id, action: "billing.checkout.subscription", targetType: "subscription", targetId: res.subscriptionId, after: body });
  return json(res);
});
