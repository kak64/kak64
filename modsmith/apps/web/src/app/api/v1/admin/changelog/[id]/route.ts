import { adminChangelogSchema } from "@modsmith/core";
import { adminCrud, MOD } from "../../_lib";
const tf = (d: any) => ({ ...d, publishedAt: d.publishedAt ? new Date(d.publishedAt) : d.state === "PUBLISHED" ? new Date() : undefined });
const crud = adminCrud({ model: "changelogEntry", entity: "changelog", schema: adminChangelogSchema, transform: tf, roles: MOD.roles });
export const GET = crud.getOne;
export const PATCH = crud.update;
export const DELETE = crud.remove;
