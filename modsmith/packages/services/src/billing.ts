import Stripe from "stripe";
import { prisma, type Prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { env } from "./env";
import { applyLedgerEntry } from "./credits";
import { notify } from "./notifications";
import { logger } from "./logger";
import { audit } from "./audit";

/**
 * Payment provider service layer. Only this module talks to Stripe.
 * Card data never touches our servers: Stripe Checkout + Customer Portal handle it.
 */
let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new ApiFailure(ErrorCodes.PAYMENT_ERROR, "Payments are not configured", 503);
  if (!client) client = new Stripe(key, { apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion, typescript: true });
  return client;
}
export const stripeConfigured = () => !!env().STRIPE_SECRET_KEY;

/**
 * Runs a Stripe call and turns provider errors into a payment failure the client can act on.
 * Without this an invalid key or a declined request surfaces as an opaque 500.
 */
async function withStripe<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiFailure) throw err;
    const e = err as { type?: string; code?: string; message?: string; statusCode?: number };
    const isStripeError = typeof e.type === "string" && e.type.startsWith("Stripe");
    if (!isStripeError) throw err;
    logger.error({ err, what }, "stripe call failed");
    const authProblem = e.type === "StripeAuthenticationError" || e.type === "StripePermissionError";
    throw new ApiFailure(
      ErrorCodes.PAYMENT_ERROR,
      authProblem ? "Payments are not configured correctly. Please contact support." : e.message ?? "The payment provider rejected this request.",
      authProblem ? 503 : 502,
      { stripeCode: e.code, stripeType: e.type },
    );
  }
}

export async function ensureStripeCustomer(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await withStripe("customers.create", () => stripe().customers.create({ email: user.email, name: user.username, metadata: { userId } }));
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

export function formatMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export async function createPackCheckout(userId: string, packId: string, quantity?: number) {
  const pack = await prisma.creditPack.findFirst({ where: { id: packId, active: true } });
  if (!pack) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Credit pack not found", 404);
  let credits = pack.credits;
  let bonus = pack.bonusCredits;
  let amountCents = pack.priceCents;
  if (pack.isCustom) {
    const q = quantity ?? pack.minCredits ?? 100;
    if (q < (pack.minCredits ?? 1) || q > (pack.maxCredits ?? 1_000_000)) throw new ApiFailure(ErrorCodes.VALIDATION_ERROR, `Choose between ${pack.minCredits} and ${pack.maxCredits} credits`, 400);
    credits = q;
    bonus = 0;
    amountCents = q * pack.priceCents;
  }
  const customerId = await ensureStripeCustomer(userId);
  const purchase = await prisma.creditPurchase.create({ data: { userId, packId: pack.id, credits, bonusCredits: bonus, amountCents, currency: pack.currency, status: "PENDING" } });
  const appUrl = env().APP_URL;
  const session = await withStripe("checkout.pack", () => stripe().checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    client_reference_id: purchase.id,
    metadata: { kind: "credit_pack", purchaseId: purchase.id, userId },
    line_items: [
      pack.stripePriceId && !pack.isCustom
        ? { price: pack.stripePriceId, quantity: 1 }
        : { price_data: { currency: pack.currency, unit_amount: amountCents, product_data: { name: `${pack.name} — ${credits.toLocaleString()} credits${bonus ? ` (+${bonus} bonus)` : ""}`, description: "Modsmith credits never expire." } }, quantity: 1 },
    ],
    success_url: `${appUrl}/app/billing?purchase=${purchase.id}&status=success`,
    cancel_url: `${appUrl}/pricing?status=cancelled`,
    allow_promotion_codes: true,
    invoice_creation: { enabled: true },
  }));
  await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { stripeCheckoutSessionId: session.id } });
  return { url: session.url!, purchaseId: purchase.id };
}

export async function createSubscriptionCheckout(userId: string, planId: string, interval: "month" | "year") {
  const plan = await prisma.subscriptionPlan.findFirst({ where: { id: planId, active: true } });
  if (!plan) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Plan not found", 404);
  const existing = await prisma.subscription.findFirst({ where: { userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] }, plan: { kind: plan.kind } } });
  if (existing?.stripeSubscriptionId) throw new ApiFailure(ErrorCodes.CONFLICT, "You already have an active plan of this type. Use the billing portal to change it.", 409);
  const customerId = await ensureStripeCustomer(userId);
  const priceId = interval === "month" ? plan.stripeMonthlyPriceId : plan.stripeYearlyPriceId;
  const amount = interval === "month" ? plan.monthlyPriceCents : plan.yearlyPriceCents;
  const sub = await prisma.subscription.create({ data: { userId, planId: plan.id, interval, status: "INCOMPLETE" } });
  const appUrl = env().APP_URL;
  const session = await withStripe("checkout.subscription", () => stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: sub.id,
    metadata: { kind: "subscription", subscriptionId: sub.id, userId, planId: plan.id, interval },
    subscription_data: { metadata: { subscriptionId: sub.id, userId, planId: plan.id, interval } },
    line_items: [
      priceId
        ? { price: priceId, quantity: 1 }
        : { price_data: { currency: plan.currency, unit_amount: amount, recurring: { interval }, product_data: { name: `${plan.name} (${interval === "month" ? "monthly" : "yearly"})`, description: plan.description ?? undefined } }, quantity: 1 },
    ],
    success_url: `${appUrl}/app/billing?subscription=${sub.id}&status=success`,
    cancel_url: `${appUrl}/pricing?status=cancelled`,
    allow_promotion_codes: true,
  }));
  await prisma.subscription.update({ where: { id: sub.id }, data: { stripeCheckoutSessionId: session.id } });
  return { url: session.url!, subscriptionId: sub.id };
}

export async function createPortalSession(userId: string) {
  const customerId = await ensureStripeCustomer(userId);
  const session = await withStripe("billingPortal.create", () => stripe().billingPortal.sessions.create({ customer: customerId, return_url: `${env().APP_URL}/app/billing` }));
  return session.url;
}

export async function cancelSubscriptionAtPeriodEnd(userId: string, subscriptionId: string) {
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, userId } });
  if (!sub?.stripeSubscriptionId) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Subscription not found", 404);
  await withStripe("subscriptions.cancel", () => stripe().subscriptions.update(sub.stripeSubscriptionId!, { cancel_at_period_end: true }));
  await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true, canceledAt: new Date() } });
  await prisma.subscriptionEvent.create({ data: { subscriptionId: sub.id, type: "cancel_requested" } });
  await audit({ actorId: userId, action: "billing.subscription.cancel", targetType: "subscription", targetId: sub.id });
}

export async function resumeSubscription(userId: string, subscriptionId: string) {
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, userId } });
  if (!sub?.stripeSubscriptionId) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Subscription not found", 404);
  await withStripe("subscriptions.resume", () => stripe().subscriptions.update(sub.stripeSubscriptionId!, { cancel_at_period_end: false }));
  await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false, canceledAt: null } });
  await prisma.subscriptionEvent.create({ data: { subscriptionId: sub.id, type: "cancel_reverted" } });
}

// ─────────────────────────── Webhook handling ───────────────────────────

export function constructWebhookEvent(rawBody: string | Buffer, signature: string) {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ApiFailure(ErrorCodes.WEBHOOK_INVALID, "Webhook secret not configured", 500);
  try {
    return stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    throw new ApiFailure(ErrorCodes.WEBHOOK_INVALID, `Invalid signature: ${(err as Error).message}`, 400);
  }
}

/** Idempotent processing keyed on the Stripe event id. Returns false if the event was already processed. */
export async function handleStripeEvent(event: Stripe.Event): Promise<{ handled: boolean; duplicate: boolean }> {
  const existing = await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id } });
  if (existing?.processedAt) return { handled: true, duplicate: true };
  if (!existing) await prisma.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } });
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.id);
        break;
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.purchaseId) await prisma.creditPurchase.updateMany({ where: { id: s.metadata.purchaseId, status: "PENDING" }, data: { status: "EXPIRED" } });
        if (s.metadata?.subscriptionId) await prisma.subscription.updateMany({ where: { id: s.metadata.subscriptionId, status: "INCOMPLETE" }, data: { status: "EXPIRED", endedAt: new Date() } });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription, event.id, event.type);
        break;
      case "invoice.paid":
        await onInvoicePaid(event.data.object as Stripe.Invoice, event.id);
        break;
      case "invoice.payment_failed":
        await onInvoiceFailed(event.data.object as Stripe.Invoice, event.id);
        break;
      case "charge.refunded":
        await onChargeRefunded(event.data.object as Stripe.Charge, event.id);
        break;
      default:
        break;
    }
    await prisma.stripeWebhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
    return { handled: true, duplicate: false };
  } catch (err) {
    await prisma.stripeWebhookEvent.update({ where: { id: event.id }, data: { error: String(err).slice(0, 500) } });
    logger.error({ err, eventId: event.id, type: event.type }, "stripe webhook failed");
    throw err;
  }
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session, eventId: string) {
  const kind = session.metadata?.kind;
  if (kind === "credit_pack" && session.metadata?.purchaseId) {
    await fulfillPurchase(session.metadata.purchaseId, { paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null, invoiceId: typeof session.invoice === "string" ? session.invoice : session.invoice?.id ?? null, eventId });
  } else if (kind === "subscription" && session.metadata?.subscriptionId && session.subscription) {
    const stripeSubId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    await prisma.subscription.update({ where: { id: session.metadata.subscriptionId }, data: { stripeSubscriptionId: stripeSubId } });
    const s = await stripe().subscriptions.retrieve(stripeSubId);
    await syncSubscription(s, eventId, "checkout.session.completed");
  }
}

export async function fulfillPurchase(purchaseId: string, ref: { paymentIntentId: string | null; invoiceId: string | null; eventId: string }) {
  const purchase = await prisma.creditPurchase.findUnique({ where: { id: purchaseId }, include: { pack: true } });
  if (!purchase) { logger.warn({ purchaseId }, "purchase not found for checkout"); return; }
  if (purchase.status === "PAID") return; // idempotent
  const total = purchase.credits + purchase.bonusCredits;
  await prisma.$transaction(async (tx) => {
    const { transaction } = await applyLedgerEntry({ userId: purchase.userId, type: "PURCHASE", amount: total, reason: `Purchased ${purchase.credits.toLocaleString()} credits${purchase.bonusCredits ? ` (+${purchase.bonusCredits} bonus)` : ""}`, referenceType: "purchase", referenceId: purchase.id, idempotencyKey: `purchase:${purchase.id}`, metadata: { stripeEventId: ref.eventId } }, tx);
    await tx.creditPurchase.update({ where: { id: purchase.id }, data: { status: "PAID", paidAt: new Date(), stripePaymentIntentId: ref.paymentIntentId ?? undefined, stripeInvoiceId: ref.invoiceId ?? undefined, transactionId: transaction.id } });
    await audit({ actorId: purchase.userId, actorType: "system", action: "billing.purchase.paid", targetType: "purchase", targetId: purchase.id, after: { credits: total, amountCents: purchase.amountCents } }, tx);
  });
  await notify({ userId: purchase.userId, type: "CREDITS_PURCHASED", title: `${total.toLocaleString()} credits added`, body: `Thanks for your purchase of ${formatMoney(purchase.amountCents, purchase.currency)}.`, href: "/app/billing", email: { template: "paymentReceipt", params: { credits: total, amount: formatMoney(purchase.amountCents, purchase.currency), url: `${env().APP_URL}/app/billing` } } });
}

function mapStatus(s: Stripe.Subscription.Status) {
  switch (s) {
    case "active": return "ACTIVE" as const;
    case "trialing": return "TRIALING" as const;
    case "past_due": return "PAST_DUE" as const;
    case "canceled": return "CANCELED" as const;
    case "unpaid": return "UNPAID" as const;
    case "incomplete": return "INCOMPLETE" as const;
    case "incomplete_expired": return "EXPIRED" as const;
    case "paused": return "PAST_DUE" as const;
    default: return "INCOMPLETE" as const;
  }
}

async function syncSubscription(s: Stripe.Subscription, eventId: string, eventType: string) {
  const localId = s.metadata?.subscriptionId;
  let sub = localId ? await prisma.subscription.findUnique({ where: { id: localId } }) : null;
  if (!sub) sub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: s.id } });
  if (!sub) {
    // Subscription created outside our checkout (e.g. portal upgrade) — map by customer + plan price.
    const customerId = typeof s.customer === "string" ? s.customer : s.customer.id;
    const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId } });
    if (!user) { logger.warn({ stripeSubId: s.id }, "subscription for unknown customer"); return; }
    const priceId = s.items.data[0]?.price.id;
    const plan = priceId ? await prisma.subscriptionPlan.findFirst({ where: { OR: [{ stripeMonthlyPriceId: priceId }, { stripeYearlyPriceId: priceId }] } }) : null;
    if (!plan) { logger.warn({ stripeSubId: s.id, priceId }, "subscription with unknown plan"); return; }
    sub = await prisma.subscription.create({ data: { userId: user.id, planId: plan.id, interval: plan.stripeYearlyPriceId === priceId ? "year" : "month", status: "INCOMPLETE", stripeSubscriptionId: s.id } });
  }
  const item = s.items.data[0];
  const periodStart = item?.current_period_start ? new Date(item.current_period_start * 1000) : null;
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
  const status = mapStatus(s.status);
  const prev = sub.status;
  // Plan change via portal: map price → plan
  const priceId = item?.price.id;
  let planId = sub.planId;
  let interval = sub.interval;
  if (priceId) {
    const plan = await prisma.subscriptionPlan.findFirst({ where: { OR: [{ stripeMonthlyPriceId: priceId }, { stripeYearlyPriceId: priceId }] } });
    if (plan) { planId = plan.id; interval = plan.stripeYearlyPriceId === priceId ? "year" : "month"; }
  }
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      stripeSubscriptionId: s.id,
      status,
      planId,
      interval,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: s.cancel_at_period_end,
      canceledAt: s.canceled_at ? new Date(s.canceled_at * 1000) : null,
      endedAt: s.ended_at ? new Date(s.ended_at * 1000) : null,
      graceUntil: status === "PAST_DUE" ? new Date(Date.now() + 7 * 86400_000) : null,
    },
  });
  await prisma.subscriptionEvent.create({ data: { subscriptionId: sub.id, type: eventType, stripeEventId: eventId, payload: { status: s.status, cancel_at_period_end: s.cancel_at_period_end } as Prisma.InputJsonValue } });
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (status === "CANCELED" && prev !== "CANCELED") {
    await notify({ userId: sub.userId, type: "SUBSCRIPTION_CANCELED", title: `${plan?.name ?? "Subscription"} ended`, body: "Your plan has ended. Credits you already have never expire.", href: "/app/billing", email: { template: "subscriptionCanceled", params: { plan: plan?.name ?? "Subscription", endsAt: (periodEnd ?? new Date()).toDateString(), url: `${env().APP_URL}/app/billing` } } });
  }
}

async function onInvoicePaid(invoice: Stripe.Invoice, eventId: string) {
  const subRef = invoice.parent?.subscription_details?.subscription;
  const stripeSubId = typeof subRef === "string" ? subRef : subRef?.id;
  if (!stripeSubId) return;
  const sub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSubId }, include: { plan: true } });
  if (!sub) return;
  const line = invoice.lines.data[0];
  const periodKey = line?.period?.start ? String(line.period.start) : invoice.id!;
  if (sub.lastAllocationPeriod === periodKey) return; // already allocated for this period
  await prisma.$transaction(async (tx) => {
    if (sub.plan.monthlyCredits > 0) {
      const credits = sub.interval === "year" ? sub.plan.monthlyCredits : sub.plan.monthlyCredits;
      await applyLedgerEntry({ userId: sub.userId, type: "SUBSCRIPTION_ALLOCATION", amount: credits, reason: `${sub.plan.name} allocation`, referenceType: "subscription", referenceId: sub.id, idempotencyKey: `sub-alloc:${sub.id}:${periodKey}`, metadata: { invoiceId: invoice.id, stripeEventId: eventId } }, tx);
    }
    await tx.subscription.update({ where: { id: sub.id }, data: { lastAllocationPeriod: periodKey, status: sub.status === "PAST_DUE" || sub.status === "INCOMPLETE" ? "ACTIVE" : sub.status, graceUntil: null } });
    await tx.subscriptionEvent.create({ data: { subscriptionId: sub.id, type: "invoice.paid", stripeEventId: eventId, payload: { invoiceId: invoice.id, amount: invoice.amount_paid } as Prisma.InputJsonValue } });
  });
  const isRenewal = invoice.billing_reason === "subscription_cycle";
  if (isRenewal) {
    await notify({ userId: sub.userId, type: "SUBSCRIPTION_RENEWED", title: `${sub.plan.name} renewed`, body: sub.plan.monthlyCredits ? `${sub.plan.monthlyCredits} credits added.` : undefined, href: "/app/billing", email: { template: "subscriptionRenewed", params: { plan: sub.plan.name, credits: sub.plan.monthlyCredits, url: `${env().APP_URL}/app/billing` } } });
  }
}

async function onInvoiceFailed(invoice: Stripe.Invoice, eventId: string) {
  const subRef = invoice.parent?.subscription_details?.subscription;
  const stripeSubId = typeof subRef === "string" ? subRef : subRef?.id;
  if (!stripeSubId) return;
  const sub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSubId }, include: { plan: true } });
  if (!sub) return;
  await prisma.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE", graceUntil: new Date(Date.now() + 7 * 86400_000) } });
  await prisma.subscriptionEvent.create({ data: { subscriptionId: sub.id, type: "invoice.payment_failed", stripeEventId: eventId } });
  await notify({ userId: sub.userId, type: "SUBSCRIPTION_PAYMENT_FAILED", title: "Payment failed", body: `We could not charge your card for ${sub.plan.name}. You have 7 days to update it.`, href: "/app/billing", email: { template: "paymentFailed", params: { url: `${env().APP_URL}/app/billing` } } });
}

async function onChargeRefunded(charge: Stripe.Charge, eventId: string) {
  const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!piId) return;
  const purchase = await prisma.creditPurchase.findUnique({ where: { stripePaymentIntentId: piId } });
  if (!purchase || purchase.status !== "PAID") return;
  const total = purchase.credits + purchase.bonusCredits;
  await prisma.$transaction(async (tx) => {
    const acc = await tx.creditAccount.findUnique({ where: { userId: purchase.userId } });
    const amount = -Math.min(total, acc?.balance ?? 0); // never negative; clawback what is left
    if (amount !== 0) await applyLedgerEntry({ userId: purchase.userId, type: "REFUND", amount, reason: "Purchase refunded", referenceType: "purchase", referenceId: purchase.id, idempotencyKey: `purchase-refund:${purchase.id}`, metadata: { stripeEventId: eventId } }, tx);
    await tx.creditPurchase.update({ where: { id: purchase.id }, data: { status: "REFUNDED" } });
  });
}
