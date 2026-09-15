import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@modsmith/db";
import { handleStripeEvent } from "./billing";
import { createUser, resetDb } from "./test/helpers";

vi.mock("./notifications", () => ({ notify: vi.fn(async () => undefined) }));

async function setup() {
  const user = await createUser({ credits: 0 });
  const plan = await prisma.subscriptionPlan.create({ data: { slug: "creator-plus", name: "Creator+", monthlyPriceCents: 1499, yearlyPriceCents: 14990, monthlyCredits: 1500, exportDiscountPct: 15, stripeMonthlyPriceId: "price_month", stripeYearlyPriceId: "price_year" } });
  const sub = await prisma.subscription.create({ data: { userId: user.id, planId: plan.id, interval: "month", status: "ACTIVE", stripeSubscriptionId: "sub_1" } });
  return { user, plan, sub };
}

function subEvent(id: string, type: string, overrides: Record<string, unknown> = {}) {
  return {
    id, type,
    data: { object: { id: "sub_1", status: "active", cancel_at_period_end: false, canceled_at: null, ended_at: null, customer: "cus_1", metadata: {}, items: { data: [{ price: { id: "price_month" }, current_period_start: 1700000000, current_period_end: 1702592000 }] }, ...overrides } },
  } as any;
}

describe("subscription lifecycle", () => {
  beforeEach(resetDb);

  it("syncs period dates and cancel-at-period-end", async () => {
    const { sub } = await setup();
    await handleStripeEvent(subEvent("evt_u1", "customer.subscription.updated", { cancel_at_period_end: true, canceled_at: 1701000000 }));
    const updated = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(updated.cancelAtPeriodEnd).toBe(true);
    expect(updated.canceledAt).not.toBeNull();
    expect(updated.currentPeriodEnd?.getTime()).toBe(1702592000 * 1000);
    expect(updated.status).toBe("ACTIVE"); // still usable until the period ends
  });

  it("ends the subscription when Stripe reports it deleted", async () => {
    const { sub } = await setup();
    await handleStripeEvent(subEvent("evt_d1", "customer.subscription.deleted", { status: "canceled", ended_at: 1702592000 }));
    const ended = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(ended.status).toBe("CANCELED");
    expect(ended.endedAt).not.toBeNull();
    expect(await prisma.subscriptionEvent.count({ where: { subscriptionId: sub.id } })).toBe(1);
  });

  it("follows a plan change made through the customer portal", async () => {
    const { sub, plan } = await setup();
    const pro = await prisma.subscriptionPlan.create({ data: { slug: "studio-pro", name: "Studio Pro", monthlyPriceCents: 3999, yearlyPriceCents: 39990, monthlyCredits: 5000, stripeMonthlyPriceId: "price_pro_month", stripeYearlyPriceId: "price_pro_year" } });
    await handleStripeEvent(subEvent("evt_up", "customer.subscription.updated", { items: { data: [{ price: { id: "price_pro_year" }, current_period_start: 1700000000, current_period_end: 1731536000 }] } }));
    const changed = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(changed.planId).toBe(pro.id);
    expect(changed.planId).not.toBe(plan.id);
    expect(changed.interval).toBe("year");
  });

  it("adopts a subscription created outside our checkout", async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: "cus_external" } });
    await prisma.subscriptionPlan.create({ data: { slug: "hub-starter", kind: "SERVER_HUB", name: "Hub Starter", monthlyPriceCents: 799, yearlyPriceCents: 7990, stripeMonthlyPriceId: "price_hub_month" } });
    await handleStripeEvent({ id: "evt_ext", type: "customer.subscription.created", data: { object: { id: "sub_ext", status: "active", cancel_at_period_end: false, customer: "cus_external", metadata: {}, items: { data: [{ price: { id: "price_hub_month" }, current_period_start: 1700000000, current_period_end: 1702592000 }] } } } } as any);
    const adopted = await prisma.subscription.findUniqueOrThrow({ where: { stripeSubscriptionId: "sub_ext" } });
    expect(adopted.userId).toBe(user.id);
    expect(adopted.status).toBe("ACTIVE");
  });

  it("ignores a subscription whose customer we do not know", async () => {
    await handleStripeEvent({ id: "evt_unknown", type: "customer.subscription.created", data: { object: { id: "sub_x", status: "active", cancel_at_period_end: false, customer: "cus_nobody", metadata: {}, items: { data: [{ price: { id: "price_none" } }] } } } } as any);
    expect(await prisma.subscription.count()).toBe(0);
    expect((await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: "evt_unknown" } })).processedAt).not.toBeNull();
  });
});
