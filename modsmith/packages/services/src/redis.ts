import IORedis, { type Redis } from "ioredis";
import { env } from "./env";

const g = globalThis as unknown as { __redis?: Redis; __redisSub?: Redis };

export function redis(): Redis {
  if (!g.__redis) {
    g.__redis = new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false, lazyConnect: false });
    g.__redis.on("error", (e) => console.error("[redis]", e.message));
  }
  return g.__redis;
}

/** Dedicated subscriber connection (ioredis cannot mix pub/sub and commands). */
export function redisSubscriber(): Redis {
  if (!g.__redisSub) {
    g.__redisSub = new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
    g.__redisSub.on("error", (e) => console.error("[redis-sub]", e.message));
  }
  return g.__redisSub;
}

export function bullConnection() {
  return { url: env().REDIS_URL };
}
