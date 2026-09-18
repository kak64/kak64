import { prisma } from "@modsmith/db";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "required" }, async ({ user, sessionId }) => {
  const sessions = await prisma.session.findMany({ where: { userId: user!.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true, remember: true } });
  return json({ sessions: sessions.map((s) => ({ ...s, current: s.id === sessionId })) });
});
