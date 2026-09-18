import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, hubProjectSchema } from "@modsmith/core";
import { audit, getStorageLimits, isFlagEnabled } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { slugify } from "@/lib/utils";

export const GET = apiRoute({ auth: "required" }, async ({ user }) => {
  const projects = await prisma.serverHubProject.findMany({ where: { userId: user!.id, deletedAt: null }, orderBy: { createdAt: "asc" }, include: { _count: { select: { logs: true, media: true, tokens: { where: { revokedAt: null } } } }, datasets: { select: { name: true, eventCount: true, lastEventAt: true } } } });
  return json({ projects: projects.map((p) => ({ id: p.id, name: p.name, slug: p.slug, description: p.description, framework: p.framework, createdAt: p.createdAt, logCount: p._count.logs, mediaCount: p._count.media, activeTokens: p._count.tokens, datasets: p.datasets })) });
});

export const POST = apiRoute({ auth: "required", body: hubProjectSchema }, async ({ user, body }) => {
  if (!(await isFlagEnabled("server_hub"))) throw new ApiFailure(ErrorCodes.TOOL_DISABLED, "Server Hub is not available", 403);
  const limits = await getStorageLimits(user!.id);
  const count = await prisma.serverHubProject.count({ where: { userId: user!.id, deletedAt: null } });
  if (count >= limits.maxServers) throw new ApiFailure(ErrorCodes.SUBSCRIPTION_REQUIRED, `Your plan allows ${limits.maxServers} server${limits.maxServers === 1 ? "" : "s"}. Upgrade to add more.`, 403);
  let slug = slugify(body.name) || "server";
  if (await prisma.serverHubProject.findUnique({ where: { userId_slug: { userId: user!.id, slug } } })) slug = `${slug}-${count + 1}`;
  const p = await prisma.serverHubProject.create({ data: { userId: user!.id, name: body.name, slug, description: body.description, framework: body.framework } });
  await audit({ actorId: user!.id, action: "hub.project.create", targetType: "hubProject", targetId: p.id, after: { name: p.name } });
  return json({ id: p.id, name: p.name, slug: p.slug }, { status: 201 });
});
