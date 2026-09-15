import { z } from "zod";
import { prisma } from "@modsmith/db";
import { storage } from "@modsmith/services";
import { apiRoute, json, paginationQuery } from "@/server/api";
import { loadOwnedProject } from "@/server/server-hub";

export const GET = apiRoute({ auth: "required", query: paginationQuery.extend({ kind: z.enum(["SCREENSHOT", "PHONE_PHOTO", "PHONE_VIDEO", "OTHER"]).optional(), player: z.string().optional(), reportId: z.string().optional() }) }, async ({ user, params, query }) => {
  const p = await loadOwnedProject(params.id!, user!.id);
  const where = { projectId: p.id, deletedAt: null, ...(query.kind ? { kind: query.kind } : {}), ...(query.reportId ? { reportId: query.reportId } : {}), ...(query.player ? { OR: [{ playerLicense: { contains: query.player } }, { playerDiscord: { contains: query.player } }, { playerName: { contains: query.player, mode: "insensitive" as const } }] } : {}) };
  const [total, items] = await Promise.all([prisma.serverHubMedia.count({ where }), prisma.serverHubMedia.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize })]);
  const s = storage();
  return json({ total, page: query.page, pageSize: query.pageSize, media: await Promise.all(items.map(async (m) => ({ id: m.id, kind: m.kind, mime: m.mime, sizeBytes: Number(m.sizeBytes), width: m.width, height: m.height, playerSource: m.playerSource, playerLicense: m.playerLicense, playerDiscord: m.playerDiscord, playerName: m.playerName, reason: m.reason, reportId: m.reportId, createdAt: m.createdAt, url: await s.signedGetUrl(m.storageKey, { ttl: 600 }) }))) });
});
