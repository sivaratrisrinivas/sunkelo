/**
 * GS-T7 measurement: absent-claim rate, cache hit rate, cost per query.
 *
 * Closest existing harness: src/lib/pipeline/synthesize.test.ts
 * That file only checks mocked LLM JSON. It cannot report live grounding,
 * cache hits, or cost. This script is a new bench rather than an extension.
 *
 * One command from a checkout with Node installed:
 *   npx tsx bench/gs-t7/run.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toSlug } from "../../src/lib/utils/slug.ts";

type SourceType = "blog" | "ecommerce" | "youtube";

type FixtureSource = {
  type: SourceType;
  title: string;
  url: string;
  content: string;
};

type FixtureProduct = {
  name: string;
  sources: FixtureSource[];
};

type FixtureQuery = {
  product_name: string;
  language: string;
};

type Dataset = {
  label: string;
  language: string;
  products: FixtureProduct[];
  queries: FixtureQuery[];
};

type SynthesizedReviewLike = {
  verdict: string;
  summary: string;
  tldr: string;
  bestFor: string;
  pros: string[];
  cons: string[];
};

type ClaimRecord = {
  product_name: string;
  field: string;
  text: string;
  content_token_count: number;
  grounded_token_count: number;
  coverage: number;
  absent: boolean;
};

const GROUNDING_TOKEN_COVERAGE_MIN = 0.5;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "is", "are", "was", "were", "be", "been", "being", "it", "this", "that", "these",
  "those", "from", "as", "by", "if", "not", "no", "so", "than", "then", "too", "very",
  "can", "will", "just", "about", "into", "over", "after", "also", "has", "have",
  "had", "its", "they", "them", "their", "you", "your", "we", "our", "more", "most",
  "some", "such", "only", "own", "same", "other", "there", "here", "when", "which",
  "who", "what", "how", "while", "during", "before", "between", "through", "under",
  "again", "further", "once", "any", "all", "each", "few", "both", "does", "did",
  "doing", "because", "until", "above", "below", "out", "off", "up", "down",
]);

const FIRECRAWL_BILLING_URL = "https://www.firecrawl.dev/pricing";
const SARVAM_PRICING_URL = "https://docs.sarvam.ai/api/getting-started/pricing";
const SARVAM_M_DEPRECATION_URL = "https://docs.sarvam.ai/api/getting-started/models/sarvam-m";

const FIRECRAWL_SEARCH_CREDITS_PER_10_RESULTS = 2;
const FIRECRAWL_SCRAPE_CREDITS = 1;
const FIRECRAWL_JSON_FORMAT_EXTRA_CREDITS = 4;
const SCRAPE_LIMITS = { blog: 5, ecommerce: 4, youtube: 3 } as const;

const FIRECRAWL_STANDARD_ANNUAL_USD_PER_MONTH = 83;
const FIRECRAWL_STANDARD_CREDITS_PER_MONTH = 100_000;
const FIRECRAWL_HOBBY_ANNUAL_USD_PER_MONTH = 16;
const FIRECRAWL_HOBBY_CREDITS_PER_MONTH = 5_000;

const here = path.dirname(fileURLToPath(import.meta.url));
const datasetPath = path.join(here, "dataset.json");
const resultsPath = path.join(here, "results.json");

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function extractClaims(review: SynthesizedReviewLike): Array<{ field: string; text: string }> {
  const claims: Array<{ field: string; text: string }> = [];
  for (const sentence of splitSentences(review.summary)) {
    claims.push({ field: "summary", text: sentence });
  }
  for (const sentence of splitSentences(review.tldr)) {
    claims.push({ field: "tldr", text: sentence });
  }
  if (review.bestFor.trim()) {
    claims.push({ field: "bestFor", text: review.bestFor.trim() });
  }
  for (const [index, item] of review.pros.entries()) {
    if (item.trim()) claims.push({ field: `pros[${index}]`, text: item.trim() });
  }
  for (const [index, item] of review.cons.entries()) {
    if (item.trim()) claims.push({ field: `cons[${index}]`, text: item.trim() });
  }
  return claims;
}

function scoreClaim(
  claimText: string,
  sourceTokenSet: Set<string>,
): Pick<ClaimRecord, "content_token_count" | "grounded_token_count" | "coverage" | "absent"> {
  const tokens = tokenize(claimText);
  if (tokens.length === 0) {
    return { content_token_count: 0, grounded_token_count: 0, coverage: 0, absent: true };
  }
  const grounded = tokens.filter((token) => sourceTokenSet.has(token)).length;
  const coverage = grounded / tokens.length;
  return {
    content_token_count: tokens.length,
    grounded_token_count: grounded,
    coverage,
    absent: coverage < GROUNDING_TOKEN_COVERAGE_MIN,
  };
}

function firecrawlCreditsUncachedQuery(): {
  search_credits: number;
  scrape_credits: number;
  json_extra_credits: number;
  total_credits: number;
  assumptions: string[];
} {
  const searchCredits = FIRECRAWL_SEARCH_CREDITS_PER_10_RESULTS * 3;
  const pageCount = SCRAPE_LIMITS.blog + SCRAPE_LIMITS.ecommerce + SCRAPE_LIMITS.youtube;
  const scrapeCredits = FIRECRAWL_SCRAPE_CREDITS * pageCount;
  const jsonExtraCredits = FIRECRAWL_JSON_FORMAT_EXTRA_CREDITS * SCRAPE_LIMITS.ecommerce;
  return {
    search_credits: searchCredits,
    scrape_credits: scrapeCredits,
    json_extra_credits: jsonExtraCredits,
    total_credits: searchCredits + scrapeCredits + jsonExtraCredits,
    assumptions: [
      "Matches src/lib/firecrawl/scraper.ts primary path: 3 searches (blog limit 5, ecommerce 4, youtube 3).",
      "Each search limit is at most 10 results, so each search is 2 credits (Firecrawl: 2 credits per 10 results).",
      "Assumes primary searches return enough trusted hits. Fallback searches in scraper.ts are not counted.",
      "Assumes every selected URL scrapes successfully. Firecrawl states failed requests are not charged.",
      "Ecommerce scrapes use JSON format (+4 credits per page) and do not fall back to a second markdown scrape.",
      "USD uses published plan allotments from firecrawl.dev/pricing, not a live invoice.",
    ],
  };
}

function usdFromCredits(credits: number, usdPerMonth: number, creditsPerMonth: number): number {
  return (credits * usdPerMonth) / creditsPerMonth;
}

function collectHardware(): Record<string, unknown> {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu_model: cpus[0]?.model ?? "unknown",
    cpu_count: cpus.length,
    total_memory_bytes: os.totalmem(),
    total_memory_gib: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(2)),
    node: process.version,
  };
}

function printTable(rows: Array<{ metric: string; value: string; status: string }>): void {
  const metricWidth = Math.max(6, ...rows.map((row) => row.metric.length));
  const valueWidth = Math.max(5, ...rows.map((row) => row.value.length));
  const statusWidth = Math.max(6, ...rows.map((row) => row.status.length));
  const header = `| ${"metric".padEnd(metricWidth)} | ${"value".padEnd(valueWidth)} | ${"status".padEnd(statusWidth)} |`;
  const divider = `| ${"-".repeat(metricWidth)} | ${"-".repeat(valueWidth)} | ${"-".repeat(statusWidth)} |`;
  const body = rows.map(
    (row) =>
      `| ${row.metric.padEnd(metricWidth)} | ${row.value.padEnd(valueWidth)} | ${row.status.padEnd(statusWidth)} |`,
  );
  console.log([header, divider, ...body].join("\n"));
}

async function trySynthesizeProduct(
  product: FixtureProduct,
): Promise<{ review: SynthesizedReviewLike | null; error: string | null }> {
  if (!process.env.SARVAM_API_KEY) {
    return { review: null, error: "SARVAM_API_KEY is not set" };
  }

  try {
    const module = await import("../../src/lib/pipeline/synthesize.ts");
    const review = (await module.synthesizeReview({
      productName: product.name,
      sources: product.sources.map((source) => ({
        url: source.url,
        title: source.title,
        type: source.type,
        content: source.content,
        originalLanguageCode: "en-IN",
        translatedToEnglish: false,
      })),
    })) as SynthesizedReviewLike;
    return { review, error: null };
  } catch (error) {
    return {
      review: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function measureLiveRedis(): Promise<{ available: boolean; reason: string }> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return {
      available: false,
      reason: "UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not set",
    };
  }
  try {
    const { getCachedReview } = await import("../../src/lib/cache/reviews.ts");
    await getCachedReview("gs-t7-probe");
    return { available: true, reason: "getCachedReview probe completed" };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const dataset = JSON.parse(readFileSync(datasetPath, "utf8")) as Dataset;
  const measuredAt = new Date().toISOString();
  const hardware = collectHardware();
  const failures: string[] = [];

  const liveRedis = await measureLiveRedis();
  if (!liveRedis.available) {
    failures.push(`live_redis: ${liveRedis.reason}`);
  }

  const cache = new Map<string, true>();
  let cacheHits = 0;
  let cacheMisses = 0;
  const cacheEvents: Array<{ query_index: number; product_name: string; slug: string; hit: boolean }> = [];

  for (const [index, query] of dataset.queries.entries()) {
    const slug = toSlug(query.product_name);
    const key = `review:${slug}`;
    const hit = cache.has(key);
    if (hit) {
      cacheHits += 1;
    } else {
      cacheMisses += 1;
      cache.set(key, true);
    }
    cacheEvents.push({ query_index: index, product_name: query.product_name, slug, hit });
  }

  const cacheHitRate = dataset.queries.length === 0 ? 0 : cacheHits / dataset.queries.length;

  const claimRecords: ClaimRecord[] = [];
  const synthesisAttempts: Array<{
    product_name: string;
    ok: boolean;
    error: string | null;
    claim_count: number | null;
    absent_count: number | null;
  }> = [];

  for (const product of dataset.products) {
    const attempt = await trySynthesizeProduct(product);
    if (!attempt.review) {
      synthesisAttempts.push({
        product_name: product.name,
        ok: false,
        error: attempt.error,
        claim_count: null,
        absent_count: null,
      });
      continue;
    }

    const sourceTokens = new Set(
      tokenize(product.sources.map((source) => `${source.title} ${source.content}`).join(" ")),
    );
    const claims = extractClaims(attempt.review);
    let absentCount = 0;
    for (const claim of claims) {
      const scored = scoreClaim(claim.text, sourceTokens);
      if (scored.absent) absentCount += 1;
      claimRecords.push({
        product_name: product.name,
        field: claim.field,
        text: claim.text,
        ...scored,
      });
    }
    synthesisAttempts.push({
      product_name: product.name,
      ok: true,
      error: null,
      claim_count: claims.length,
      absent_count: absentCount,
    });
  }

  if (!synthesisAttempts.some((item) => item.ok)) {
    failures.push(
      "absent_claim_rate: no synthesized reviews. Product synthesizeReview was not run successfully. This checkout has no SARVAM_API_KEY, and sarvam-m is documented as deprecated.",
    );
  }

  const totalClaims = claimRecords.length;
  const absentClaims = claimRecords.filter((claim) => claim.absent).length;
  const absentClaimRate = totalClaims === 0 ? null : absentClaims / totalClaims;

  const firecrawl = firecrawlCreditsUncachedQuery();
  const uncachedCredits = firecrawl.total_credits;
  const workloadCreditsTotal = cacheMisses * uncachedCredits;
  const workloadCreditsAverage =
    dataset.queries.length === 0 ? 0 : workloadCreditsTotal / dataset.queries.length;

  const firecrawlUsdUncachedStandard = usdFromCredits(
    uncachedCredits,
    FIRECRAWL_STANDARD_ANNUAL_USD_PER_MONTH,
    FIRECRAWL_STANDARD_CREDITS_PER_MONTH,
  );
  const firecrawlUsdUncachedHobby = usdFromCredits(
    uncachedCredits,
    FIRECRAWL_HOBBY_ANNUAL_USD_PER_MONTH,
    FIRECRAWL_HOBBY_CREDITS_PER_MONTH,
  );
  const firecrawlUsdWorkloadStandard = usdFromCredits(
    workloadCreditsAverage,
    FIRECRAWL_STANDARD_ANNUAL_USD_PER_MONTH,
    FIRECRAWL_STANDARD_CREDITS_PER_MONTH,
  );

  const results = {
    task: "GS-T7",
    measured_at: measuredAt,
    date_utc: measuredAt.slice(0, 10),
    model: {
      synthesis: "sarvam-m",
      synthesis_status:
        "Product code still sends model sarvam-m. Sarvam documents this model as deprecated and no longer available on Chat Completions.",
      audio_script: "gemini-2.0-flash",
      audio_script_included_in_cost: false,
    },
    dataset: {
      path: "bench/gs-t7/dataset.json",
      label: dataset.label,
      product_count: dataset.products.length,
      source_count: dataset.products.reduce((sum, product) => sum + product.sources.length, 0),
      query_count: dataset.queries.length,
      unique_products_in_queries: new Set(dataset.queries.map((query) => query.product_name)).size,
    },
    hardware,
    methodology: {
      absent_claims: {
        claim_units:
          "Sentences from summary and tldr, plus bestFor, plus each pro, plus each con. Verdict is excluded because it is a classification, not a source fact.",
        tokenizer: "Unicode letters and numbers, lowercase, tokens shorter than 3 dropped, stopwords dropped.",
        grounded_rule: `A claim is grounded if at least ${GROUNDING_TOKEN_COVERAGE_MIN} of its content tokens appear in the concatenated fixture sources for that product. Otherwise it is absent.`,
        sources: "Fixture review texts in dataset.json. Not live scrapes.",
        live_synthesis:
          "Uses src/lib/pipeline/synthesize.ts when SARVAM_API_KEY is set. No mock summaries are scored.",
      },
      cache: {
        live_redis: liveRedis,
        simulation:
          "In-memory Map using the production review-cache key review:${slug} from src/lib/cache/reviews.ts and toSlug from src/lib/utils/slug.ts. Matches the query route skip of scrape plus synthesize on getCachedReview hit. Localized cache is not filled because localize is not run. Workload is the listed query sequence: 8 first-time products then 4 repeats. Cold start. Not padded to the spec 60% week-1 target.",
      },
      cost: {
        observed_usd: "Not measured. This environment issued no billed Firecrawl or Sarvam calls.",
        firecrawl_credits: firecrawl,
        firecrawl_usd_sources: {
          page: FIRECRAWL_BILLING_URL,
          standard_annual: `$${FIRECRAWL_STANDARD_ANNUAL_USD_PER_MONTH}/month for ${FIRECRAWL_STANDARD_CREDITS_PER_MONTH} credits`,
          hobby_annual: `$${FIRECRAWL_HOBBY_ANNUAL_USD_PER_MONTH}/month for ${FIRECRAWL_HOBBY_CREDITS_PER_MONTH} credits`,
          headline_plan: "standard_annual because Firecrawl labels Standard as recommended",
        },
        sarvam_m: {
          published_token_rate_usd: null,
          reason: `sarvam-m is not listed on ${SARVAM_PRICING_URL}. Deprecation: ${SARVAM_M_DEPRECATION_URL}. No billed token counts were observed.`,
        },
        excluded: [
          "STT (Saaras)",
          "entity extraction chat",
          "Mayura translation",
          "Gemini 2.0 Flash audio script",
          "Bulbul TTS",
        ],
      },
    },
    metrics: {
      absent_claim_rate: absentClaimRate,
      absent_claims: absentClaims,
      total_claims: totalClaims,
      cache_hit_rate: cacheHitRate,
      cache_hits: cacheHits,
      cache_misses: cacheMisses,
      cache_backend: "in_memory_policy_replica",
      cost_per_query_usd_observed: null,
      cost_per_query_usd_total_estimated: null,
      firecrawl_credits_per_uncached_query: uncachedCredits,
      firecrawl_usd_per_uncached_query_standard_annual: Number(firecrawlUsdUncachedStandard.toFixed(6)),
      firecrawl_usd_per_uncached_query_hobby_annual: Number(firecrawlUsdUncachedHobby.toFixed(6)),
      firecrawl_credits_per_query_workload_average: Number(workloadCreditsAverage.toFixed(4)),
      firecrawl_usd_per_query_workload_average_standard_annual: Number(
        firecrawlUsdWorkloadStandard.toFixed(6),
      ),
    },
    synthesis_attempts: synthesisAttempts,
    cache_events: cacheEvents,
    claim_records: claimRecords,
    failures,
  };

  writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);

  const absentDisplay = absentClaimRate === null ? "n/a" : absentClaimRate.toFixed(4);
  const absentStatus = absentClaimRate === null ? "failed: no live summaries" : "ok";

  printTable([
    { metric: "absent_claim_rate", value: absentDisplay, status: absentStatus },
    {
      metric: "cache_hit_rate",
      value: cacheHitRate.toFixed(4),
      status: "ok (in-memory policy replica, cold cache)",
    },
    {
      metric: "cost_per_query_usd_observed",
      value: "n/a",
      status: "failed: no billed API usage in this environment",
    },
    {
      metric: "cost_per_query_usd_total_estimated",
      value: "n/a",
      status: "failed: sarvam-m has no published token rate and no observed tokens",
    },
    {
      metric: "firecrawl_credits_per_uncached_query",
      value: String(uncachedCredits),
      status: "estimated from scraper.ts primary path",
    },
    {
      metric: "firecrawl_usd_per_uncached_query_standard_annual",
      value: firecrawlUsdUncachedStandard.toFixed(6),
      status: "estimated; Firecrawl Standard annual allotment",
    },
    {
      metric: "firecrawl_usd_per_query_workload_average_standard_annual",
      value: firecrawlUsdWorkloadStandard.toFixed(6),
      status: "estimated; 8 misses and 4 hits in this workload",
    },
  ]);

  console.log("");
  console.log(`Wrote ${path.relative(process.cwd(), resultsPath)}`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
