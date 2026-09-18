import { prisma } from "@modsmith/db";
import { apiRoute, json } from "@/server/api";
import { loadOwnedCreation } from "@/server/creations";

export const POST = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const c = await loadOwnedCreation(params.id!, user!.id);
  const copy = await prisma.creation.create({ data: { userId: user!.id, toolSlug: c.toolSlug, name: `${c.name} (copy)`, originalFilename: c.originalFilename, status: "DRAFT", config: c.config ?? undefined, projectState: c.projectState ?? undefined, metadata: c.metadata ?? undefined, thumbnailKey: c.thumbnailKey, isPublic: false } });
  return json({ id: copy.id, name: copy.name }, { status: 201 });
});
