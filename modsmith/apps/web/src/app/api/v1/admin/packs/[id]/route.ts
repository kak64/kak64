import { adminPackSchema } from "@modsmith/core";
import { adminCrud } from "../../_lib";
const crud = adminCrud({ model: "creditPack", entity: "creditPack", schema: adminPackSchema });
export const GET = crud.getOne;
export const PATCH = crud.update;
export const DELETE = crud.remove;
