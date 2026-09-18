import { adminPackSchema } from "@modsmith/core";
import { adminCrud } from "../_lib";
const crud = adminCrud({ model: "creditPack", entity: "creditPack", schema: adminPackSchema, orderBy: { sortOrder: "asc" } });
export const GET = crud.list;
export const POST = crud.create;
