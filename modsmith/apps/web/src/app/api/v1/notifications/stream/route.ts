import type { NextRequest } from "next/server";
import { redisSubscriber } from "@modsmith/services";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

/** SSE stream of new notifications for the signed-in user. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const encoder = new TextEncoder();
  const sub = redisSubscriber().duplicate();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      await sub.subscribe(`user:${session.user.id}:notifications`);
      sub.on("message", (_c, msg) => { if (!closed) controller.enqueue(encoder.encode(`data: ${msg}\n\n`)); });
      const ping = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": ping\n\n")); }, 20000);
      req.signal.addEventListener("abort", () => { closed = true; clearInterval(ping); try { controller.close(); } catch { /* closed */ } sub.disconnect(); });
    },
    cancel() { closed = true; sub.disconnect(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
