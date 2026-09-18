import { retryJob } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { ADMIN } from "../../../_lib";

export const POST = apiRoute(ADMIN, async ({ user, params }) => { await retryJob(params.id!, user!.id); return json({ ok: true }); });
