import { adminPlanSchema } from "@modsmith/core";
import { adminCrud } from "../../_lib";
const tf = (d: any) => ({ ...d, hubStorageBytes: d.hubStorageBytes == null ? d.hubStorageBytes : BigInt(d.hubStorageBytes) });
const crud = adminCrud({ model: "subscriptionPlan", entity: "subscriptionPlan", schema: adminPlanSchema, transform: tf });
export const GET = crud.getOne;
export const PATCH = crud.update;
export const DELETE = crud.remove;
