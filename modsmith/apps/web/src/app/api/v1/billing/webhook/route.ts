import { NextResponse, type NextRequest } from "next/server";
import { constructWebhookEvent, handleStripeEvent, logger } from "@modsmith/services";
import { ApiFailure } from "@modsmith/core";

export const dynamic = "force-dynamic";

/** Stripe webhook. Signature verified with the raw body; processing is idempotent per event id. */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ success: false, data: null, error: { code: "WEBHOOK_INVALID", message: "Missing signature" } }, { status: 400 });
  const raw = await req.text();
  try {
    const event = constructWebhookEvent(raw, sig);
    const res = await handleStripeEvent(event);
    return NextResponse.json({ success: true, data: { received: true, duplicate: res.duplicate }, error: null });
  } catch (err) {
    if (err instanceof ApiFailure) return NextResponse.json({ success: false, data: null, error: { code: err.code, message: err.message } }, { status: err.status });
    logger.error({ err }, "stripe webhook handler error");
    // 500 so Stripe retries
    return NextResponse.json({ success: false, data: null, error: { code: "INTERNAL", message: "Webhook processing failed" } }, { status: 500 });
  }
}
