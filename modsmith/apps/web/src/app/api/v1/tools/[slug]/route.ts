import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { getEffectiveTool } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "none" }, async ({ params }) => {
  const tool = await getEffectiveTool(params.slug!);
  if (!tool || !tool.enabled) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Tool not found", 404);
  return json(tool);
});
