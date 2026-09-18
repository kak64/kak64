import { z } from "zod";
import { estimateJob } from "@modsmith/services";
import { apiRoute, json } from "@/server/api";

const body = z.object({ uploadIds: z.array(z.string()).max(32).default([]), config: z.record(z.unknown()).default({}), externalRef: z.object({ provider: z.string(), id: z.string() }).optional() });

export const POST = apiRoute({ auth: "required", body }, async ({ user, body, params }) => {
  const { uploads: _u, ...est } = await estimateJob({ userId: user!.id, emailVerified: !!user!.emailVerifiedAt, toolSlug: params.slug!, uploadIds: body.uploadIds, config: body.config, externalRef: body.externalRef });
  return json(est);
});
