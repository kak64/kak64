import { adminGuideSchema } from "@modsmith/core";
import { adminCrud, MOD } from "../../_lib";
const tf = (d: any) => ({ ...d, publishedAt: d.state === "PUBLISHED" ? new Date() : undefined });
const crud = adminCrud({ model: "guide", entity: "guide", schema: adminGuideSchema, include: { category: true }, transform: tf, roles: MOD.roles });
export const GET = crud.getOne;
export const PATCH = crud.update;
export const DELETE = crud.remove;
