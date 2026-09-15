import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";

/**
 * Loads a Server Hub project that belongs to the given user, or throws 404.
 * Kept out of the route module because Next.js route files may only export handlers and config.
 */
export async function loadOwnedProject(id: string, userId: string) {
  const p = await prisma.serverHubProject.findFirst({ where: { id, userId, deletedAt: null } });
  if (!p) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Server not found", 404);
  return p;
}
