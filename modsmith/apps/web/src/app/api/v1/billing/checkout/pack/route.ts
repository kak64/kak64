import { checkoutPackSchema } from "@modsmith/core";
import { RATE_LIMITS, createPackCheckout, audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const POST = apiRoute({ auth: "required", body: checkoutPackSchema, rateLimit: RATE_LIMITS.checkout }, async ({ user, body }) => {
  const res = await createPackCheckout(user!.id, body.packId, body.quantity);
  await audit({ actorId: user!.id, action: "billing.checkout.pack", targetType: "purchase", targetId: res.purchaseId, after: { packId: body.packId, quantity: body.quantity } });
  return json(res);
});
