import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiFailure, ErrorCodes, LIMITS, ok } from "@modsmith/core";
import { RATE_LIMITS, authenticateServerToken, completeMediaReservation, createMediaReservation, env, rateLimit } from "@modsmith/services";
import { errorResponse } from "@/server/api";

export const dynamic = "force-dynamic";

const meta = z.object({ player: z.object({ source: z.coerce.number().int().optional(), license: z.string().max(128).optional(), discord: z.string().max(64).optional(), name: z.string().max(64).optional() }).optional(), reason: z.string().max(200).optional(), reportId: z.string().max(64).optional() });

/**
 * POST /hub-ingest/v1/screenshots — server-side upload of a screenshot captured with screencapture / screenshot-basic.
 * multipart/form-data: file=<image>, metadata=<json>  (or raw body + X-Metadata header)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateServerToken(req.headers.get("authorization"));
    const rl = await rateLimit(RATE_LIMITS.screenshots, auth.projectId);
    if (!rl.allowed) throw new ApiFailure(ErrorCodes.RATE_LIMITED, "Screenshot rate limit exceeded", 429);
    let body: Buffer;
    let metadata: z.infer<typeof meta> = {};
    const ct = req.headers.get("content-type") ?? "";
    if (ct.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof Blob)) throw new ApiFailure(ErrorCodes.INVALID_FILE, "Missing file field", 400);
      body = Buffer.from(await file.arrayBuffer());
      const m = form.get("metadata");
      if (typeof m === "string") metadata = meta.parse(JSON.parse(m));
    } else {
      body = Buffer.from(await req.arrayBuffer());
      const m = req.headers.get("x-metadata");
      if (m) metadata = meta.parse(JSON.parse(m));
    }
    if (body.length > LIMITS.HUB_MEDIA_MAX_BYTES) throw new ApiFailure(ErrorCodes.FILE_TOO_LARGE, "Screenshot too large", 413);
    const { reservation, uploadToken } = await createMediaReservation(auth.projectId, auth.userId, { kind: "SCREENSHOT", maxBytes: LIMITS.HUB_MEDIA_MAX_BYTES, metadata });
    const media = await completeMediaReservation(reservation.id, uploadToken, body);
    return NextResponse.json(ok({ mediaId: media.id, url: `${env().APP_URL}/api/v1/server-hub/media/${media.id}`, width: media.width, height: media.height }), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
