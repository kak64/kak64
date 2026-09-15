import type { NextRequest } from "next/server";
import { prisma } from "@modsmith/db";
import { redisSubscriber } from "@modsmith/services";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

/** Server-Sent Events stream of job progress. Replays the current state, then relays Redis pub/sub. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const job = await prisma.processingJob.findFirst({ where: { id, userId: session.user.id }, select: { id: true, status: true, stage: true, progress: true, errorMessage: true } });
  if (!job) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const sub = redisSubscriber().duplicate();
  const channel = `job:${id}`;
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => { if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); };
      send({ jobId: id, status: job.status, stage: job.stage, progress: job.progress, message: job.errorMessage ?? undefined, replay: true });
      if (["COMPLETED", "FAILED", "CANCELLED", "REFUNDED"].includes(job.status)) { closed = true; controller.close(); sub.disconnect(); return; }
      await sub.subscribe(channel);
      sub.on("message", (_ch, msg) => {
        try { const ev = JSON.parse(msg); send(ev); if (["COMPLETED", "FAILED", "CANCELLED", "REFUNDED"].includes(ev.status)) { closed = true; controller.close(); sub.disconnect(); } } catch { /* ignore */ }
      });
      const ping = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": ping\n\n")); else clearInterval(ping); }, 15000);
      req.signal.addEventListener("abort", () => { closed = true; clearInterval(ping); try { controller.close(); } catch { /* closed */ } sub.disconnect(); });
    },
    cancel() { closed = true; sub.disconnect(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
