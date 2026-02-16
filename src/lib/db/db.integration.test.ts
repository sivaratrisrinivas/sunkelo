import { describe, expect, it } from "vitest";

import { checkDbConnection, getDbClient } from "./client";

const hasDatabaseUrl = Boolean(process.env.NEON_DATABASE_URL);
const dbDescribe = hasDatabaseUrl ? describe : describe.skip;

dbDescribe("db integration", () => {
  it("runs SELECT 1", async () => {
    const sql = getDbClient();
    const rows = (await sql`SELECT 1 AS value`) as Array<{ value: number }>;
    expect(rows[0].value).toBe(1);
  });

  it("health check passes", async () => {
    await expect(checkDbConnection()).resolves.toBe(true);
  });
});
