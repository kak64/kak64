import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";

/**
 * Loads a creation that belongs to the given user, or throws 404.
 *
 * This lives outside the route module because Next.js route files may only export HTTP handlers
 * and route configuration; any other export fails the generated type check.
 */
export async function loadOwnedCreation(id: string, userId: string) {
  const c = await prisma.creation.findFirst({
    where: { id, userId, deletedAt: null },
    include: {
      upload: { select: { id: true, status: true, expiresAt: true } },
      currentVersion: true,
      currentJob: { select: { id: true, status: true, stage: true, progress: true, errorMessage: true } },
      showcaseItem: true,
      versions: { orderBy: { version: "desc" }, take: 20 },
    },
  });
  if (!c) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Creation not found", 404);
  return c;
}
