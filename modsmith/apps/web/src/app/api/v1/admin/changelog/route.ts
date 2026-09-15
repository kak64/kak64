import { adminChangelogSchema } from "@modsmith/core";
import { adminCrud, MOD } from "../_lib";
const tf = (d: any) => ({ ...d, publishedAt: d.publishedAt ? new Date(d.publishedAt) : d.state === "PUBLISHED" ? new Date() : undefined });
const crud = adminCrud({ model: "changelogEntry", entity: "changelog", schema: adminChangelogSchema, orderBy: { createdAt: "desc" }, searchFields: ["title", "version"], transform: tf, roles: MOD.roles });
export const GET = crud.list;
export const POST = crud.create;
