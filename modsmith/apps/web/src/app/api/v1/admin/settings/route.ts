import { z } from "zod";
import { prisma } from "@modsmith/db";
import { audit, setSetting } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";
import { ADMIN } from "../_lib";

export const GET = apiRoute(ADMIN, async () => json({ settings: await prisma.systemSetting.findMany({ orderBy: { key: "asc" } }) }));
export const PATCH = apiRoute({ ...ADMIN, body: z.object({ key: z.string().min(1).max(64), value: z.union([z.number(), z.string(), z.boolean()]) }) }, async ({ user, body, ip, userAgent }) => {
  await setSetting(body.key, body.value);
  await audit({ actorId: user!.id, actorType: "admin", action: "admin.setting.update", targetType: "setting", targetId: body.key, after: { value: body.value }, ip, userAgent });
  return json({ ok: true });
});
