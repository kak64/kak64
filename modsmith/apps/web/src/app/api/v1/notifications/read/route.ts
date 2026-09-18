import { z } from "zod";
import { prisma } from "@modsmith/db";
import { apiRoute, json } from "@/server/api";

export const POST = apiRoute({ auth: "required", body: z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() }) }, async ({ user, body }) => {
  await prisma.notification.updateMany({ where: { userId: user!.id, readAt: null, ...(body.all ? {} : { id: { in: body.ids ?? [] } }) }, data: { readAt: new Date() } });
  const unread = await prisma.notification.count({ where: { userId: user!.id, readAt: null } });
  return json({ unread });
});
