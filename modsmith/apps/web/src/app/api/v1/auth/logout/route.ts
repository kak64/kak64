import { apiRoute, json } from "@/server/api";
import { destroySession } from "@/server/session";

export const POST = apiRoute({ auth: "optional" }, async () => {
  await destroySession();
  return json({ ok: true });
});
