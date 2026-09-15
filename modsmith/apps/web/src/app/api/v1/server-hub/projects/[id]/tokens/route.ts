import { hubTokenSchema } from "@modsmith/core";
import { createServerToken } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { loadOwnedProject } from "../route";

/** Creates a server token. The raw token is returned exactly once. */
export const POST = apiRoute({ auth: "required", body: hubTokenSchema }, async ({ user, params, body }) => {
  const p = await loadOwnedProject(params.id!, user!.id);
  const { token, record } = await createServerToken(p.id, body.name, user!.id);
  return json({ id: record.id, name: record.name, prefix: record.prefix, token, createdAt: record.createdAt }, { status: 201 });
});
