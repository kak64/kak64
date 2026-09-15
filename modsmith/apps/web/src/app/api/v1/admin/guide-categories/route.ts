import { z } from "zod";
import { adminCrud } from "../_lib";
const schema = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,48}$/), name: z.string().min(1).max(48), description: z.string().max(200).optional().nullable(), icon: z.string().max(32).optional().nullable(), sortOrder: z.number().int().default(0) });
const crud = adminCrud({ model: "guideCategory", entity: "guideCategory", schema, orderBy: { sortOrder: "asc" } });
export const GET = crud.list;
export const POST = crud.create;
