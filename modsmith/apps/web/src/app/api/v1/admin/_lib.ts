import { z } from "zod";
import { prisma, type Prisma } from "@modsmith/db";
import { ApiFailure, ErrorCodes } from "@modsmith/core";
import { audit, invalidateCache } from "@modsmith/services";
import { apiRoute, json, paginationQuery, type ApiOptions } from "@/server/api";

export const ADMIN = { auth: "required" as const, roles: ["ADMIN"] as Array<"USER" | "MODERATOR" | "ADMIN"> };
export const MOD = { auth: "required" as const, roles: ["ADMIN", "MODERATOR"] as Array<"USER" | "MODERATOR" | "ADMIN"> };

type Delegate = {
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  findUnique: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
};

/** Generic audited CRUD factory for admin CMS-style resources. */
export function adminCrud<TSchema extends z.ZodTypeAny>(opts: { model: keyof typeof prisma; entity: string; schema: TSchema; orderBy?: Record<string, "asc" | "desc">; cacheKeys?: string[]; searchFields?: string[]; include?: Record<string, unknown>; transform?: (data: z.infer<TSchema>) => Record<string, unknown>; roles?: ApiOptions<any, any>["roles"] }) {
  const delegate = () => prisma[opts.model] as unknown as Delegate;
  const base = { auth: "required" as const, roles: opts.roles ?? ADMIN.roles };
  const bust = async () => { for (const k of opts.cacheKeys ?? []) await invalidateCache(k); };
  const list = apiRoute({ ...base, query: paginationQuery.extend({ q: z.string().max(100).optional() }) }, async ({ query }) => {
    const where = query.q && opts.searchFields?.length ? { OR: opts.searchFields.map((f) => ({ [f]: { contains: query.q, mode: "insensitive" } })) } : {};
    const [total, items] = await Promise.all([delegate().count({ where }), delegate().findMany({ where, orderBy: opts.orderBy ?? { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: opts.include })]);
    return json({ total, page: query.page, pageSize: query.pageSize, items: items.map(serialize) });
  });
  const create = apiRoute({ ...base, body: opts.schema }, async ({ user, body, ip, userAgent }) => {
    const data = opts.transform ? opts.transform(body) : (body as Record<string, unknown>);
    const item = await delegate().create({ data });
    await audit({ actorId: user!.id, actorType: "admin", action: `admin.${opts.entity}.create`, targetType: opts.entity, targetId: item.id ?? item.slug ?? item.key, after: data, ip, userAgent });
    await bust();
    return json(serialize(item), { status: 201 });
  });
  const getOne = apiRoute({ ...base }, async ({ params }) => {
    const item = await delegate().findUnique({ where: { id: params.id }, include: opts.include });
    if (!item) throw new ApiFailure(ErrorCodes.NOT_FOUND, `${opts.entity} not found`, 404);
    return json(serialize(item));
  });
  const update = apiRoute({ ...base, body: (opts.schema as unknown as z.AnyZodObject).partial() }, async ({ user, params, body, ip, userAgent }) => {
    const before = await delegate().findUnique({ where: { id: params.id } });
    if (!before) throw new ApiFailure(ErrorCodes.NOT_FOUND, `${opts.entity} not found`, 404);
    const data = opts.transform ? opts.transform(body as z.infer<TSchema>) : (body as Record<string, unknown>);
    const item = await delegate().update({ where: { id: params.id }, data });
    await audit({ actorId: user!.id, actorType: "admin", action: `admin.${opts.entity}.update`, targetType: opts.entity, targetId: params.id, before: serialize(before), after: data, ip, userAgent });
    await bust();
    return json(serialize(item));
  });
  const remove = apiRoute({ ...base }, async ({ user, params, ip, userAgent }) => {
    const before = await delegate().findUnique({ where: { id: params.id } });
    if (!before) throw new ApiFailure(ErrorCodes.NOT_FOUND, `${opts.entity} not found`, 404);
    await delegate().delete({ where: { id: params.id } });
    await audit({ actorId: user!.id, actorType: "admin", action: `admin.${opts.entity}.delete`, targetType: opts.entity, targetId: params.id, before: serialize(before), ip, userAgent });
    await bust();
    return json({ ok: true });
  });
  return { list, create, getOne, update, remove };
}

export function serialize<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? Number(val) : val)));
}

export type Tx = Prisma.TransactionClient;
