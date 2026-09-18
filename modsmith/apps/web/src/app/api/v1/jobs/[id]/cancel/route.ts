import { cancelJob } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const POST = apiRoute({ auth: "required" }, async ({ user, params }) => {
  const j = await cancelJob(params.id!, user!.id);
  return json({ id: j.id, status: j.status });
});
