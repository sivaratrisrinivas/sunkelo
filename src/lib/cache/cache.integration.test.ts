import { describe, expect, it } from "vitest";

import { getRedisClient } from "./client";

const hasRedisConfig =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
const redisDescribe = hasRedisConfig ? describe : describe.skip;

redisDescribe("redis integration", () => {
  it("supports set/get/del round-trip", async () => {
    const redis = getRedisClient();
    const key = `integration:test:${Date.now()}`;

    await redis.set(key, "value");
    const value = await redis.get<string>(key);
    await redis.del(key);
    const deletedValue = await redis.get<string>(key);

    expect(value).toBe("value");
    expect(deletedValue).toBeNull();
  });
});
