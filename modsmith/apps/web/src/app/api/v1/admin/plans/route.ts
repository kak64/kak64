import { adminPlanSchema } from "@modsmith/core";
import { adminCrud } from "../_lib";
const tf = (d: any) => ({ ...d, hubStorageBytes: d.hubStorageBytes == null ? d.hubStorageBytes : BigInt(d.hubStorageBytes) });
const crud = adminCrud({ model: "subscriptionPlan", entity: "subscriptionPlan", schema: adminPlanSchema, orderBy: { sortOrder: "asc" }, transform: tf });
export const GET = crud.list;
export const POST = crud.create;
