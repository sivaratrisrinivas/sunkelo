import { getDbClient } from "./client";

type InsertLogInput = {
  ipHash: string;
  transcript?: string;
  languageCode?: string;
  intent?: string;
  productId?: number;
  cacheHit?: boolean;
  latencyMs?: number;
};

export async function insertLog(input: InsertLogInput): Promise<void> {
  const sql = getDbClient();

  // Intentionally non-blocking in call sites; this function itself is safe to await.
  await sql`
    INSERT INTO query_logs (ip_hash, transcript, language_code, intent, product_id, cache_hit, latency_ms)
    VALUES (
      ${input.ipHash},
      ${input.transcript ?? null},
      ${input.languageCode ?? null},
      ${input.intent ?? null},
      ${input.productId ?? null},
      ${input.cacheHit ?? false},
      ${input.latencyMs ?? null}
    )
  `;
}
