import { adminGuideSchema } from "@modsmith/core";
import { adminCrud, MOD } from "../_lib";
const tf = (d: any) => ({ ...d, publishedAt: d.state === "PUBLISHED" ? new Date() : undefined });
const crud = adminCrud({ model: "guide", entity: "guide", schema: adminGuideSchema, orderBy: { updatedAt: "desc" }, searchFields: ["title", "slug"], include: { category: true }, transform: tf, roles: MOD.roles });
export const GET = crud.list;
export const POST = crud.create;
