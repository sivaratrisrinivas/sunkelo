import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sqlClient: NeonQueryFunction<false, false> | null = null;

export function getDbClient(): NeonQueryFunction<false, false> {
  if (sqlClient) {
    return sqlClient;
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("NEON_DATABASE_URL is not set");
  }

  sqlClient = neon(databaseUrl);
  return sqlClient;
}

export async function checkDbConnection(): Promise<boolean> {
  const sql = getDbClient();
  const result = await sql`SELECT 1 AS ok`;
  return result[0]?.ok === 1;
}
