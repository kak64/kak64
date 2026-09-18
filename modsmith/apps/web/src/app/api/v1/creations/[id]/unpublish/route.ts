import { prisma } from "@modsmith/db";
import { audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { loadOwnedCreation } from "@/server/creations";

export const POST = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const c = await loadOwnedCreation(params.id!, user!.id);
  await prisma.$transaction([
    prisma.showcaseItem.updateMany({ where: { creationId: c.id }, data: { status: "HIDDEN" } }),
    prisma.creation.update({ where: { id: c.id }, data: { isPublic: false } }),
  ]);
  await audit({ actorId: user!.id, action: "showcase.unpublish", targetType: "creation", targetId: c.id });
  return json({ ok: true });
});
