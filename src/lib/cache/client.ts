import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing");
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

export async function checkRedisConnection(): Promise<boolean> {
  const redis = getRedisClient();
  const key = "health:ping";
  await redis.set(key, "ok", { ex: 10 });
  const value = await redis.get<string>(key);
  await redis.del(key);
  return value === "ok";
}
