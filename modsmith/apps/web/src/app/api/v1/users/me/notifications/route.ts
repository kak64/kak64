import { prisma } from "@modsmith/db";
import { updateNotificationsSchema } from "@modsmith/core";
import { apiRoute, json } from "@/server/api";

export const PATCH = apiRoute({ auth: "required", body: updateNotificationsSchema }, async ({ user, body }) => {
  const u = await prisma.user.update({ where: { id: user!.id }, data: body, select: { notifyEmail: true, notifyDiscord: true, notifyJobComplete: true, notifyMarketing: true } });
  return json(u);
});
