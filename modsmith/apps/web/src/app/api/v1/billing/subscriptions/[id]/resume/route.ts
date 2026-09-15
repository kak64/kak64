import { resumeSubscription } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const POST = apiRoute({ auth: "required" }, async ({ user, params }) => { await resumeSubscription(user!.id, params.id!); return json({ ok: true }); });
