import { prisma } from "@modsmith/db";
import { audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const POST = apiRoute({ auth: "required" }, async ({ user }) => {
  await prisma.discordConnection.deleteMany({ where: { userId: user!.id } });
  await audit({ actorId: user!.id, action: "discord.disconnect", targetType: "user", targetId: user!.id });
  return json({ ok: true });
});
