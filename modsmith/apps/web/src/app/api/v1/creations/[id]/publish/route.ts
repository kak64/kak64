import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes, publishSchema } from "@modsmith/core";
import { audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { slugify } from "@/lib/utils";
import { loadOwnedCreation } from "@/server/creations";

export const POST = apiRoute({ auth: "required", body: publishSchema, requireVerified: true }, async ({ user, params, body }) => {
  const c = await loadOwnedCreation(params.id!, user!.id);
  if (c.status !== "READY" || !c.currentVersionId) throw new ApiFailure(ErrorCodes.CONFLICT, "Only completed creations can be published", 409);
  let slug = slugify(body.title) || c.id.slice(-8);
  if (await prisma.showcaseItem.findFirst({ where: { slug, NOT: { creationId: c.id } } })) slug = `${slug}-${c.id.slice(-6)}`;
  const item = await prisma.showcaseItem.upsert({
    where: { creationId: c.id },
    create: { creationId: c.id, userId: user!.id, slug, title: body.title, description: body.description, category: body.category, toolSlug: c.toolSlug, tags: body.tags, thumbnailKey: c.thumbnailKey, screenshotKeys: [], allowDownload: body.allowDownload, allowRemix: body.allowRemix, status: "PUBLISHED" },
    update: { title: body.title, description: body.description, category: body.category, tags: body.tags, allowDownload: body.allowDownload, allowRemix: body.allowRemix, status: "PUBLISHED", thumbnailKey: c.thumbnailKey },
  });
  await prisma.creation.update({ where: { id: c.id }, data: { isPublic: true } });
  await audit({ actorId: user!.id, action: "showcase.publish", targetType: "showcase", targetId: item.id, after: { title: body.title, allowDownload: body.allowDownload } });
  return json({ slug: item.slug, url: `/showcase/${item.slug}` });
});
