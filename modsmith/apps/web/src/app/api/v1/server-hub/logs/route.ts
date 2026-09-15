import { prisma, type Prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, hubLogSearchSchema } from "@modsmith/core";
import { apiRoute, json } from "@/server/api";

const LEVELS = { debug: "DEBUG", info: "INFO", warn: "WARN", error: "ERROR", fatal: "FATAL" } as const;

/** Cursor-paginated log search across message + serialized metadata. */
export const GET = apiRoute({ auth: "required", query: hubLogSearchSchema.extend({ level: hubLogSearchSchema.shape.level.or(hubLogSearchSchema.shape.level.unwrap().element.transform((v) => [v])) }) }, async ({ user, query }) => {
  const p = await prisma.serverHubProject.findFirst({ where: { id: query.projectId, userId: user!.id, deletedAt: null } });
  if (!p) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Server not found", 404);
  const where: Prisma.ServerHubLogWhereInput = { projectId: p.id };
  if (query.from || query.to) where.occurredAt = { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) };
  if (query.level?.length) where.level = { in: query.level.map((l) => LEVELS[l]) };
  if (query.dataset) where.dataset = { name: query.dataset };
  if (query.resource) where.resource = query.resource;
  if (query.player) where.OR = [{ playerLicense: { contains: query.player } }, { playerDiscord: { contains: query.player } }, { playerName: { contains: query.player, mode: "insensitive" } }, ...(Number.isInteger(Number(query.player)) ? [{ playerSource: Number(query.player) }, { targetSource: Number(query.player) }] : [])];
  if (query.q) {
    const text = { contains: query.q, mode: "insensitive" as const };
    const textOr: Prisma.ServerHubLogWhereInput[] = [{ message: text }, { metadataText: text }];
    where.AND = where.AND ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), { OR: textOr }] : [{ OR: textOr }];
  }
  if (query.cursor) {
    const [ts, id] = query.cursor.split("_");
    const cursorDate = new Date(Number(ts));
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: [{ occurredAt: { lt: cursorDate } }, { occurredAt: cursorDate, id: { lt: id } }] }];
  }
  const rows = await prisma.serverHubLog.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: query.limit + 1, include: { dataset: { select: { name: true } } } });
  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit);
  const last = items[items.length - 1];
  return json({ logs: items.map((l) => ({ id: l.id, timestamp: l.occurredAt, receivedAt: l.receivedAt, level: l.level, dataset: l.dataset.name, resource: l.resource, message: l.message, metadata: l.metadata, player: { source: l.playerSource, target: l.targetSource, license: l.playerLicense, discord: l.playerDiscord, name: l.playerName } })), nextCursor: hasMore && last ? `${last.occurredAt.getTime()}_${last.id}` : null });
});
