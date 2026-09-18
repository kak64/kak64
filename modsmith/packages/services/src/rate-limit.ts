import { redis } from "./redis";
import { ApiFailure, ErrorCodes } from "@modsmith/core";

export interface RateLimitRule {
  /** Namespace, e.g. "login" */
  name: string;
  /** Max hits per window */
  limit: number;
  /** Window seconds */
  window: number;
}

export const RATE_LIMITS = {
  login: { name: "login", limit: 10, window: 300 },
  register: { name: "register", limit: 5, window: 3600 },
  forgot: { name: "forgot", limit: 5, window: 3600 },
  reset: { name: "reset", limit: 10, window: 3600 },
  verifyResend: { name: "verify-resend", limit: 3, window: 600 },
  verify: { name: "verify", limit: 20, window: 600 },
  uploads: { name: "uploads", limit: 60, window: 3600 },
  aiGenerations: { name: "ai", limit: 10, window: 3600 },
  externalImports: { name: "external-import", limit: 10, window: 3600 },
  api: { name: "api", limit: 600, window: 60 },
  hubIngest: { name: "hub-ingest", limit: 600, window: 60 },
  hubMedia: { name: "hub-media", limit: 120, window: 60 },
  screenshots: { name: "screenshots", limit: 60, window: 60 },
  referralClick: { name: "ref-click", limit: 20, window: 3600 },
  review: { name: "review", limit: 3, window: 86400 },
  report: { name: "report", limit: 10, window: 3600 },
  jobs: { name: "jobs", limit: 30, window: 3600 },
  checkout: { name: "checkout", limit: 10, window: 600 },
  discord: { name: "discord", limit: 10, window: 600 },
} satisfies Record<string, RateLimitRule>;

// Sliding window log implemented atomically in Lua.
const SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window * 1000)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = window * 1000 - (now - tonumber(oldest[2]))
  return {0, count, retry}
end
redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
redis.call('PEXPIRE', key, window * 1000)
return {1, count + 1, 0}
`;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export async function rateLimit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  const r = redis();
  const key = `rl:${rule.name}:${subject}`;
  try {
    const res = (await r.eval(SCRIPT, 1, key, Date.now(), rule.window, rule.limit)) as [number, number, number];
    return { allowed: res[0] === 1, remaining: Math.max(0, rule.limit - res[1]), retryAfterMs: res[2] };
  } catch {
    // Fail open on Redis outage but log; the app still has DB-level protections.
    console.error("[rate-limit] redis unavailable; failing open");
    return { allowed: true, remaining: rule.limit, retryAfterMs: 0 };
  }
}

export async function enforceRateLimit(rule: RateLimitRule, subject: string) {
  const res = await rateLimit(rule, subject);
  if (!res.allowed) {
    throw new ApiFailure(ErrorCodes.RATE_LIMITED, `Too many requests. Try again in ${Math.ceil(res.retryAfterMs / 1000)}s.`, 429, { retryAfterMs: res.retryAfterMs });
  }
  return res;
}
