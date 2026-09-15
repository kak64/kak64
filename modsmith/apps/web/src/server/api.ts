import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiFailure, ErrorCodes, fail, flattenZodError, ok } from "@modsmith/core";
import { getSession, type SessionUser, CSRF_COOKIE } from "./session";
import { env } from "@modsmith/services";
import { logger } from "@modsmith/services";
import { rateLimit, RATE_LIMITS, safeEqual, type RateLimitRule } from "@modsmith/services";

export type ApiContext<TBody = unknown, TQuery = unknown> = {
  req: NextRequest;
  user: SessionUser | null;
  sessionId: string | null;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
  ip: string | null;
  userAgent: string | null;
};

export type ApiOptions<TBody extends z.ZodTypeAny | undefined, TQuery extends z.ZodTypeAny | undefined> = {
  auth?: "required" | "optional" | "none";
  roles?: Array<"USER" | "MODERATOR" | "ADMIN">;
  requireVerified?: boolean;
  body?: TBody;
  query?: TQuery;
  rateLimit?: RateLimitRule | ((ctx: { ip: string | null; user: SessionUser | null }) => { rule: RateLimitRule; subject: string } | null);
  /** Skip origin/CSRF checks (webhooks, bearer-token APIs). */
  csrf?: boolean;
  maxBodyBytes?: number;
};

type Infer<T> = T extends z.ZodTypeAny ? z.infer<T> : undefined;

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(ok(data), init);
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiFailure) {
    return NextResponse.json(fail(err.code, err.message, err.details), { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json(fail(ErrorCodes.VALIDATION_ERROR, "Validation failed", flattenZodError(err)), { status: 400 });
  }
  logger.error({ err }, "unhandled api error");
  return NextResponse.json(fail(ErrorCodes.INTERNAL, "Something went wrong"), { status: 500 });
}

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
}

function checkCsrf(req: NextRequest) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  const appOrigin = new URL(env().APP_URL).origin;
  if (origin && origin !== appOrigin) {
    throw new ApiFailure(ErrorCodes.CSRF, "Cross-origin request rejected", 403);
  }
  if (!origin) {
    // Non-browser clients must present the CSRF header matching the cookie.
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") throw new ApiFailure(ErrorCodes.CSRF, "Cross-site request rejected", 403);
  }
  const header = req.headers.get("x-csrf-token");
  const cookie = req.cookies.get(CSRF_COOKIE)?.value;
  // Double-submit: when a CSRF cookie exists, the header must match it.
  if (cookie && (!header || !safeEqual(header, cookie))) throw new ApiFailure(ErrorCodes.CSRF, "Missing or invalid CSRF token", 403);
}

/**
 * Wraps a route handler with: body/query validation, session resolution, role checks,
 * CSRF/origin checks, rate limiting and consistent error envelopes.
 */
export function apiRoute<TBody extends z.ZodTypeAny | undefined = undefined, TQuery extends z.ZodTypeAny | undefined = undefined>(
  options: ApiOptions<TBody, TQuery>,
  handler: (ctx: ApiContext<Infer<TBody>, Infer<TQuery>>) => Promise<Response>,
) {
  return async (req: NextRequest, routeCtx?: { params?: Promise<Record<string, string>> | Record<string, string> }): Promise<Response> => {
    try {
      if (options.csrf !== false) checkCsrf(req);
      const ip = getIp(req);
      const userAgent = req.headers.get("user-agent");
      const session = options.auth === "none" ? null : await getSession();
      const user = session?.user ?? null;

      if (options.auth === "required" && !user) throw new ApiFailure(ErrorCodes.UNAUTHORIZED, "Sign in required", 401);
      if (options.roles && (!user || !options.roles.includes(user.role))) throw new ApiFailure(ErrorCodes.FORBIDDEN, "Insufficient permissions", 403);
      if (options.requireVerified && user && !user.emailVerifiedAt) throw new ApiFailure(ErrorCodes.EMAIL_NOT_VERIFIED, "Verify your email to continue", 403);

      // Generic API rate limit + route-specific
      const generic = await rateLimit(RATE_LIMITS.api, user?.id ?? ip ?? "anon");
      if (!generic.allowed) throw new ApiFailure(ErrorCodes.RATE_LIMITED, "Too many requests", 429);
      if (options.rateLimit) {
        const spec = typeof options.rateLimit === "function" ? options.rateLimit({ ip, user }) : { rule: options.rateLimit, subject: user?.id ?? ip ?? "anon" };
        if (spec) {
          const res = await rateLimit(spec.rule, spec.subject);
          if (!res.allowed) throw new ApiFailure(ErrorCodes.RATE_LIMITED, `Too many requests. Try again in ${Math.ceil(res.retryAfterMs / 1000)}s.`, 429, { retryAfterMs: res.retryAfterMs });
        }
      }

      let body: unknown = undefined;
      if (options.body) {
        const len = Number(req.headers.get("content-length") ?? 0);
        if (len > (options.maxBodyBytes ?? 1_000_000)) throw new ApiFailure(ErrorCodes.PAYLOAD_TOO_LARGE, "Request body too large", 413);
        const ct = req.headers.get("content-type") ?? "";
        let raw: unknown;
        if (ct.includes("application/json")) raw = await req.json().catch(() => { throw new ApiFailure(ErrorCodes.VALIDATION_ERROR, "Invalid JSON body", 400); });
        else if (ct.includes("form")) raw = Object.fromEntries((await req.formData()).entries());
        else raw = {};
        body = options.body.parse(raw);
      }
      let query: unknown = undefined;
      if (options.query) {
        const obj: Record<string, string | string[]> = {};
        req.nextUrl.searchParams.forEach((v, k) => {
          if (k in obj) obj[k] = ([] as string[]).concat(obj[k]!, v);
          else obj[k] = v;
        });
        query = options.query.parse(obj);
      }
      const rawParams = routeCtx?.params ? await routeCtx.params : {};
      return await handler({ req, user, sessionId: session?.sessionId ?? null, body: body as Infer<TBody>, query: query as Infer<TQuery>, params: rawParams, ip, userAgent });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
