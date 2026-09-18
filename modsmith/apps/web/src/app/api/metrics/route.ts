import { NextResponse, type NextRequest } from "next/server";
import { collectMetrics, env, renderPrometheus, safeEqual } from "@modsmith/services";

export const dynamic = "force-dynamic";

/**
 * Prometheus metrics. Guarded by METRICS_TOKEN (`Authorization: Bearer …` or `?token=`),
 * and disabled entirely when no token is configured so it can never leak by default.
 */
export async function GET(req: NextRequest) {
  const expected = env().METRICS_TOKEN;
  if (!expected || expected === "change-me") return new NextResponse("Metrics are not enabled", { status: 404 });
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.nextUrl.searchParams.get("token") ?? "";
  if (!provided || !safeEqual(provided, expected)) return new NextResponse("Unauthorized", { status: 401 });
  const metrics = await collectMetrics();
  if (req.nextUrl.searchParams.get("format") === "json") return NextResponse.json(metrics, { headers: { "Cache-Control": "no-store" } });
  return new NextResponse(renderPrometheus(metrics), { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" } });
}
