import { TOOL_CATEGORIES } from "@modsmith/core";
import { getEffectiveTools } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

export const GET = apiRoute({ auth: "none" }, async () => {
  const tools = await getEffectiveTools();
  return json({ tools: tools.filter((t) => t.enabled), categories: TOOL_CATEGORIES });
});
