import { NextResponse, type NextRequest } from "next/server";
import { ErrorCodes, fail, hubReservationSchema, ok } from "@modsmith/core";
import { RATE_LIMITS, authenticateServerToken, createMediaReservation, env, rateLimit } from "@modsmith/services";
import { errorResponse } from "@/server/api";

export const dynamic = "force-dynamic";

const KIND = { screenshot: "SCREENSHOT", phone_photo: "PHONE_PHOTO", phone_video: "PHONE_VIDEO", other: "OTHER" } as const;

/**
 * POST /hub-ingest/v1/media/reservations — server-side only (bearer token).
 * Returns a one-time upload URL that the capture/NUI side can PUT bytes to without ever seeing the server token.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateServerToken(req.headers.get("authorization"));
    const rl = await rateLimit(RATE_LIMITS.hubMedia, auth.projectId);
    if (!rl.allowed) return NextResponse.json(fail(ErrorCodes.RATE_LIMITED, "Media rate limit exceeded"), { status: 429 });
    const body = hubReservationSchema.parse(await req.json().catch(() => ({})));
    const { reservation, uploadToken, ttl, maxBytes } = await createMediaReservation(auth.projectId, auth.userId, { kind: KIND[body.kind], mime: body.mime, maxBytes: body.maxBytes, metadata: body.metadata });
    const uploadUrl = `${env().APP_URL}/hub-ingest/v1/media/reservations/${reservation.id}?t=${uploadToken}`;
    return NextResponse.json(ok({ reservationId: reservation.id, uploadUrl, method: "PUT", expiresIn: ttl, maxBytes, allowedMimes: reservation.allowedMimes }), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
