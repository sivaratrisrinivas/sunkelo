import { getDbClient } from "./client";

type CreateReviewInput = {
  productId: number;
  languageCode: string;
  verdict: "buy" | "skip" | "wait";
  confidenceScore: number;
  summary: string;
  tldr: string;
  pros: string[];
  cons: string[];
  bestFor?: string;
  sources: Array<{ title: string; url: string; type?: string }>;
};

type ReviewRow = {
  id: string;
  product_id: string;
  language_code: string;
  verdict: "buy" | "skip" | "wait";
  confidence_score: number;
  summary: string;
  tldr: string;
  pros: string[];
  cons: string[];
  best_for: string | null;
  sources: Array<{ title: string; url: string; type?: string }>;
  created_at: string;
};

type ReviewTranslationRow = {
  id: string;
  review_id: string;
  language_code: string;
  summary: string;
  tldr: string;
  audio_url: string | null;
  created_at: string;
};

export async function createReview(input: CreateReviewInput): Promise<number> {
  const sql = getDbClient();
  const rows = (await sql`
    INSERT INTO reviews (
      product_id, language_code, verdict, confidence_score, summary, tldr, pros, cons, best_for, sources
    ) VALUES (
      ${input.productId},
      ${input.languageCode},
      ${input.verdict},
      ${input.confidenceScore},
      ${input.summary},
      ${input.tldr},
      ${JSON.stringify(input.pros)},
      ${JSON.stringify(input.cons)},
      ${input.bestFor ?? null},
      ${JSON.stringify(input.sources)}
    )
    RETURNING id
  `) as Array<{ id: string }>;

  return Number(rows[0].id);
}

export async function getByProductId(productId: number): Promise<ReviewRow[]> {
  const sql = getDbClient();
  return (await sql`
    SELECT
      id, product_id, language_code, verdict, confidence_score, summary, tldr, pros, cons, best_for, sources, created_at
    FROM reviews
    WHERE product_id = ${productId}
    ORDER BY created_at DESC
  `) as ReviewRow[];
}

export async function getWithTranslations(productId: number) {
  const sql = getDbClient();
  return sql`
    SELECT
      r.id AS review_id,
      r.language_code,
      r.summary,
      r.tldr,
      r.verdict,
      r.confidence_score,
      rt.language_code AS translation_language_code,
      rt.summary AS translated_summary,
      rt.tldr AS translated_tldr,
      rt.audio_url AS translated_audio_url
    FROM reviews r
    LEFT JOIN review_translations rt ON rt.review_id = r.id
    WHERE r.product_id = ${productId}
    ORDER BY r.created_at DESC, rt.language_code ASC
  `;
}

export async function upsertReviewTranslation(input: {
  reviewId: number;
  languageCode: string;
  summary: string;
  tldr: string;
  audioUrl?: string | null;
}): Promise<{
  id: number;
  reviewId: number;
  languageCode: string;
  summary: string;
  tldr: string;
  audioUrl: string | null;
  createdAt: Date;
}> {
  const sql = getDbClient();
  const rows = (await sql`
    INSERT INTO review_translations (review_id, language_code, summary, tldr, audio_url)
    VALUES (${input.reviewId}, ${input.languageCode}, ${input.summary}, ${input.tldr}, ${input.audioUrl ?? null})
    ON CONFLICT (review_id, language_code)
    DO UPDATE SET
      summary = EXCLUDED.summary,
      tldr = EXCLUDED.tldr,
      audio_url = EXCLUDED.audio_url
    RETURNING id, review_id, language_code, summary, tldr, audio_url, created_at
  `) as ReviewTranslationRow[];

  const row = rows[0];
  return {
    id: Number(row.id),
    reviewId: Number(row.review_id),
    languageCode: row.language_code,
    summary: row.summary,
    tldr: row.tldr,
    audioUrl: row.audio_url,
    createdAt: new Date(row.created_at),
  };
}
