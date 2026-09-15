import { NextResponse, type NextRequest } from "next/server";
import { ApiFailure, ErrorCodes, LIMITS, fail, hubLogBatchSchema, ok } from "@modsmith/core";
import { RATE_LIMITS, authenticateServerToken, ingestLogs, rateLimit } from "@modsmith/services";
import { errorResponse } from "@/server/api";

export const dynamic = "force-dynamic";

/**
 * POST /hub-ingest/v1/logs
 * Authorization: Bearer <server-token>
 * Body: array of 1–100 events (≤ 1 MiB). Idempotent per event `id` (or X-Request-Id + index).
 */
export async function POST(req: NextRequest) {
  try {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > LIMITS.HUB_LOG_REQUEST_MAX_BYTES) throw new ApiFailure(ErrorCodes.PAYLOAD_TOO_LARGE, "Request exceeds 1 MiB", 413);
    const auth = await authenticateServerToken(req.headers.get("authorization"));
    const rl = await rateLimit(RATE_LIMITS.hubIngest, auth.projectId);
    if (!rl.allowed) return NextResponse.json(fail(ErrorCodes.RATE_LIMITED, "Ingestion rate limit exceeded"), { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });
    const raw = await req.text();
    if (raw.length > LIMITS.HUB_LOG_REQUEST_MAX_BYTES) throw new ApiFailure(ErrorCodes.PAYLOAD_TOO_LARGE, "Request exceeds 1 MiB", 413);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new ApiFailure(ErrorCodes.VALIDATION_ERROR, "Body must be JSON", 400); }
    const events = hubLogBatchSchema.parse(Array.isArray(parsed) ? parsed : [parsed]);
    const requestId = req.headers.get("x-request-id")?.slice(0, 64) ?? undefined;
    const res = await ingestLogs(auth.projectId, auth.userId, events, requestId);
    return NextResponse.json(ok(res), { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
