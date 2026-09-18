import { NextResponse, type NextRequest } from "next/server";
import { ApiFailure, ErrorCodes, LIMITS, ok } from "@modsmith/core";
import { completeMediaReservation, env } from "@modsmith/services";
import { errorResponse } from "@/server/api";

export const dynamic = "force-dynamic";

/**
 * PUT /hub-ingest/v1/media/reservations/:id?t=<one-time-token>
 * Raw image bytes (or multipart/form-data with a `file` field). Validated by magic bytes and size.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const token = req.nextUrl.searchParams.get("t") ?? req.headers.get("x-upload-token") ?? "";
    if (!token) throw new ApiFailure(ErrorCodes.UNAUTHORIZED, "Missing upload token", 401);
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > LIMITS.HUB_MEDIA_MAX_BYTES + 4096) throw new ApiFailure(ErrorCodes.FILE_TOO_LARGE, "File too large", 413);
    let body: Buffer;
    const ct = req.headers.get("content-type") ?? "";
    if (ct.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof Blob)) throw new ApiFailure(ErrorCodes.INVALID_FILE, "Missing file field", 400);
      body = Buffer.from(await file.arrayBuffer());
    } else if ((req.headers.get("content-transfer-encoding") ?? "").toLowerCase() === "base64") {
      // FiveM's PerformHttpRequest cannot send binary bodies reliably; the bridge sends base64.
      body = Buffer.from((await req.text()).replace(/^data:[^;]+;base64,/, ""), "base64");
    } else {
      body = Buffer.from(await req.arrayBuffer());
    }
    const media = await completeMediaReservation(id, token, body);
    return NextResponse.json(ok({ mediaId: media.id, url: `${env().APP_URL}/api/v1/server-hub/media/${media.id}`, mime: media.mime, width: media.width, height: media.height, sizeBytes: Number(media.sizeBytes) }), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
export const POST = PUT;
