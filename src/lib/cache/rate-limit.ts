import { getRedisClient } from "./client";
import { QUERY_RATE_LIMIT_PER_DAY } from "@/lib/utils/constants";

const WINDOW_SECONDS = 24 * 60 * 60;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export async function checkRateLimit(ipHash: string): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const key = `rate-limit:${ipHash}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  const ttl = await redis.ttl(key);
  const remaining = Math.max(0, QUERY_RATE_LIMIT_PER_DAY - count);
  const allowed = count <= QUERY_RATE_LIMIT_PER_DAY;

  return {
    allowed,
    remaining,
    resetAt: Date.now() + Math.max(ttl, 0) * 1000,
  };
}
