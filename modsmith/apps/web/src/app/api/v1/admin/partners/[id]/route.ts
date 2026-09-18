import { adminPartnerSchema } from "@modsmith/core";
import { adminCrud } from "../../_lib";
const crud = adminCrud({ model: "partner", entity: "partner", schema: adminPartnerSchema });
export const GET = crud.getOne;
export const PATCH = crud.update;
export const DELETE = crud.remove;
