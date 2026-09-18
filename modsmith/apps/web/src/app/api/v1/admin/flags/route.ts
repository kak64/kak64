import { prisma } from "@modsmith/db";
import { apiRoute, json } from "@/server/api";
import { ADMIN } from "../_lib";
export const GET = apiRoute(ADMIN, async () => json({ flags: await prisma.featureFlag.findMany({ orderBy: { key: "asc" } }) }));
