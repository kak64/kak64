import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@modsmith/db";
import { handleStripeEvent } from "./billing";
import { getBalance } from "./credits";
import { createUser, resetDb } from "./test/helpers";

vi.mock("./notifications", () => ({ notify: vi.fn(async () => undefined) }));

function checkoutEvent(id: string, purchaseId: string, userId: string) {
  return { id, type: "checkout.session.completed", data: { object: { id: "cs_1", metadata: { kind: "credit_pack", purchaseId, userId }, payment_intent: "pi_1", invoice: null } } } as any;
}

describe("stripe webhook (integration)", () => {
  beforeEach(resetDb);

  it("fulfills a purchase once even if the webhook is delivered twice", async () => {
    const u = await createUser({ credits: 0 });
    const pack = await prisma.creditPack.create({ data: { slug: "starter", name: "Starter", credits: 150, bonusCredits: 10, priceCents: 499 } });
    const purchase = await prisma.creditPurchase.create({ data: { userId: u.id, packId: pack.id, credits: 150, bonusCredits: 10, amountCents: 499, currency: "usd", status: "PENDING" } });
    const r1 = await handleStripeEvent(checkoutEvent("evt_1", purchase.id, u.id));
    const r2 = await handleStripeEvent(checkoutEvent("evt_1", purchase.id, u.id));
    expect(r1.duplicate).toBe(false);
    expect(r2.duplicate).toBe(true);
    // A different event id for the same purchase (Stripe retry with new id) is also safe:
    await handleStripeEvent(checkoutEvent("evt_2", purchase.id, u.id));
    expect(await getBalance(u.id)).toBe(160);
    const p = await prisma.creditPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(p.status).toBe("PAID");
    expect(p.stripePaymentIntentId).toBe("pi_1");
    expect(await prisma.creditTransaction.count({ where: { userId: u.id, type: "PURCHASE" } })).toBe(1);
  });

  it("marks past_due and allocates credits on invoice.paid renewal", async () => {
    const u = await createUser({ credits: 0 });
    const plan = await prisma.subscriptionPlan.create({ data: { slug: "creator-plus", name: "Creator+", monthlyPriceCents: 1499, yearlyPriceCents: 14990, monthlyCredits: 1500 } });
    const sub = await prisma.subscription.create({ data: { userId: u.id, planId: plan.id, interval: "month", status: "ACTIVE", stripeSubscriptionId: "sub_1" } });
    await handleStripeEvent({ id: "evt_f", type: "invoice.payment_failed", data: { object: { id: "in_0", parent: { subscription_details: { subscription: "sub_1" } }, lines: { data: [] } } } } as any);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("PAST_DUE");
    await handleStripeEvent({ id: "evt_p", type: "invoice.paid", billing_reason: "subscription_cycle", data: { object: { id: "in_1", billing_reason: "subscription_cycle", amount_paid: 1499, parent: { subscription_details: { subscription: "sub_1" } }, lines: { data: [{ period: { start: 1700000000 } }] } } } } as any);
    await handleStripeEvent({ id: "evt_p2", type: "invoice.paid", data: { object: { id: "in_1", parent: { subscription_details: { subscription: "sub_1" } }, lines: { data: [{ period: { start: 1700000000 } }] } } } } as any);
    expect(await getBalance(u.id)).toBe(1500); // allocated once per period
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("ACTIVE");
  });
});
