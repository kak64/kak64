import { createPortalSession } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const POST = apiRoute({ auth: "required" }, async ({ user }) => json({ url: await createPortalSession(user!.id) }));
