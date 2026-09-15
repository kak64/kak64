import { adminPartnerSchema } from "@modsmith/core";
import { adminCrud } from "../_lib";
const crud = adminCrud({ model: "partner", entity: "partner", schema: adminPartnerSchema, orderBy: { priority: "desc" }, searchFields: ["name", "slug"] });
export const GET = crud.list;
export const POST = crud.create;
