import { prisma } from "@modsmith/db";
import { updatePrivacySchema } from "@modsmith/core";
import { apiRoute, json } from "@/server/api";

export const PATCH = apiRoute({ auth: "required", body: updatePrivacySchema }, async ({ user, body }) => {
  const u = await prisma.user.update({ where: { id: user!.id }, data: body, select: { profilePublic: true, showcaseDefaultPublic: true } });
  return json(u);
});
