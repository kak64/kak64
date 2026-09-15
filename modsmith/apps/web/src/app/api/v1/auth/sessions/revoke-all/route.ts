import { audit } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { revokeAllSessions } from "@/server/session";

export const POST = apiRoute({ auth: "required" }, async ({ user }) => {
  await revokeAllSessions(user!.id, true);
  await audit({ actorId: user!.id, action: "auth.session.revoke_all", targetType: "user", targetId: user!.id });
  return json({ ok: true });
});
