import { apiRoute, json } from "@/server/api";
import { loadOwnedCreation } from "@/server/creations";

export const GET = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const c = await loadOwnedCreation(params.id!, user!.id);
  return json({ versions: c.versions.map((v) => ({ id: v.id, version: v.version, resourceName: v.resourceName, sizeBytes: Number(v.sizeBytes), creditCost: v.creditCost, createdAt: v.createdAt, manifest: v.manifest })) });
});
