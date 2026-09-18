import { prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { createServerToken, revokeServerToken } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { loadOwnedProject } from "@/server/server-hub";

export const POST = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const p = await loadOwnedProject(params.id!, user!.id);
  const t = await prisma.serverHubToken.findFirst({ where: { id: params.tokenId, projectId: p.id } });
  if (!t) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Token not found", 404);
  await revokeServerToken(t.id, user!.id);
  const { token, record } = await createServerToken(p.id, t.name, user!.id);
  return json({ id: record.id, name: record.name, prefix: record.prefix, token, createdAt: record.createdAt }, { status: 201 });
});
