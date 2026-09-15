import { prisma } from "@modsmith/db";
import { apiRoute, json } from "@/server/api";
import { ADMIN } from "../_lib";

export const GET = apiRoute(ADMIN, async () => json({ tools: await prisma.toolConfig.findMany({ orderBy: { sortOrder: "asc" } }) }));
