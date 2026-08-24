/**
 * GS-T7 measurement: absent-claim rate, cache hit rate, cost per query.
 *
 * Closest existing harness is src/app/api/query/latency-budget.test.ts.
 * That file already drives the query path including cache hit vs miss, but it
 * mocks scrape, synthesis, and Redis. It cannot record live absent claims or
 * billed cost. This script is a new bench that calls the product modules.
 *
 * Run: npm run bench:gs-t7
 */
import { cpus, hostname, totalmem } from "node:os";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getCachedLocalized,
  getCachedReview,
  setCachedLocalized,
  setCachedReview,
  type CachedReview,
} from "../src/lib/cache/reviews";
import { scrapeAllSources } from "../src/lib/firecrawl/scraper";
import type { NormalizedReviewSource } from "../src/lib/pipeline/normalize-sources";
import { synthesizeReview } from "../src/lib/pipeline/synthesize";
import { toSlug } from "../src/lib/utils/slug";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DATASET_PATH = join(HERE, "dataset.json");
const RESULTS_PATH = join(HERE, "gs-t7-results.json");

const SYNTHESIS_MODEL = "sarvam-m";
const GROUNDING_OVERLAP = 0.6;
const LANGUAGE = "en-IN";

type DatasetSource = {
  title: string;
  url: string;
  type: "blog" | "ecommerce" | "youtube";
  content: string;
};

type DatasetProduct = {
  name: string;
  query: string;
  sources: DatasetSource[];
};

type DatasetFile = {
  description: string;
  products: DatasetProduct[];
};

type ClaimJudgement = {
  claim: string;
  grounded: boolean;
  overlap: number;
  missingNumbers: string[];
};

type ProductRow = {
  name: string;
  slug: string;
  sourceOrigin: "live-scrape" | "fixture";
  sourceLoadError: string | null;
  sourceCount: number;
  sourceChars: number;
  synthesisStatus: "ok" | "failed";
  synthesisError: string | null;
  summaryChars: number | null;
  claims: number;
  absentClaims: number;
  absentClaimRate: number | null;
  claimDetails: ClaimJudgement[];
};

type MetricOk = {
  status: "ok";
  value: number;
  unit: string;
  detail: string;
};

type MetricFailed = {
  status: "failed";
  value: null;
  unit: string;
  error: string;
};

type Metric = MetricOk | MetricFailed;

const STOPWORDS = new Set(
  `a an the and or but if then than so as at by for from in into of on onto to with without
   is are was were be been being it its this that these those they them their you your we our
   he she his her not no nor very more most less least also just can could should would will
   has have had do does did about over under again still only other another both each few
   many much such same own too when where which who whom why how`.split(/\s+/),
);

function loadDotEnv(): void {
  for (const name of [".env.local", ".env"]) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function envFlag(name: string): boolean {
  const value = process.env[name];
  return Boolean(value && value.trim().length > 0);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^a-z0-9.]+/)
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter((token) => token.length > 0);
}

function contentTokens(text: string): string[] {
  return tokenize(text).filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function numberTokens(text: string): string[] {
  return text.toLowerCase().match(/\d+(?:\.\d+)?/g) ?? [];
}

function extractSummaryClaims(summary: string): string[] {
  return summary
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => contentTokens(part).length >= 4);
}

function judgeClaim(claim: string, sourceText: string): ClaimJudgement {
  const sourceTokenSet = new Set(contentTokens(sourceText));
  const sourceRaw = sourceText.toLowerCase();
  const claimTokens = contentTokens(claim);
  const nums = numberTokens(claim);
  const missingNumbers = nums.filter((num) => !sourceRaw.includes(num));
  const overlapCount = claimTokens.filter((token) => sourceTokenSet.has(token)).length;
  const overlap = claimTokens.length === 0 ? 0 : overlapCount / claimTokens.length;
  const grounded = missingNumbers.length === 0 && overlap >= GROUNDING_OVERLAP;
  return { claim, grounded, overlap: Number(overlap.toFixed(4)), missingNumbers };
}

function instrumentChecks(): Array<{ name: string; passed: boolean; detail: string }> {
  const source =
    "The phone has a 5000mAh battery and a 120Hz AMOLED display. Charging is 33W wired. Night photos show noise.";
  const grounded = judgeClaim("The 5000mAh battery and 120Hz AMOLED display last well.", source);
  const absent = judgeClaim("It includes a 200MP periscope zoom and satellite calling.", source);
  return [
    {
      name: "grounded-claim-detected",
      passed: grounded.grounded === true,
      detail: `overlap=${grounded.overlap} missingNumbers=${grounded.missingNumbers.join(",") || "none"}`,
    },
    {
      name: "absent-claim-detected",
      passed: absent.grounded === false,
      detail: `overlap=${absent.overlap} missingNumbers=${absent.missingNumbers.join(",") || "none"}`,
    },
  ];
}

function dummyReview(): CachedReview {
  const summary =
    "GS-T7 cache probe payload used only to exercise getCachedReview and setCachedReview. " +
    "It is not a synthesized review and is not scored for absent claims. Padding for schema length.";
  return {
    verdict: "wait",
    pros: ["Bench cache probe"],
    cons: ["Not a real review"],
    bestFor: "Cache measurement only",
    summary,
    tldr: "Synthetic cache payload for GS-T7 hit rate measurement only.",
    confidenceScore: 0.1,
    sources: [
      {
        title: "GS-T7 cache probe",
        url: "https://example.com/gs-t7-cache-probe",
        type: "blog",
      },
    ],
  };
}

function hardwareInfo() {
  const cpuList = cpus();
  return {
    hostname: hostname(),
    platform: process.platform,
    arch: process.arch,
    cpuModel: cpuList[0]?.model?.trim() || "unknown",
    cpuCount: cpuList.length,
    ramGiB: Number((totalmem() / 1024 / 1024 / 1024).toFixed(1)),
    node: process.version,
  };
}

function fixtureSources(product: DatasetProduct): NormalizedReviewSource[] {
  return product.sources.map((source) => ({
    url: source.url,
    title: source.title,
    type: source.type,
    content: source.content,
    originalLanguageCode: "en-IN",
    translatedToEnglish: false,
  }));
}

async function loadSources(product: DatasetProduct): Promise<{
  sources: NormalizedReviewSource[];
  origin: "live-scrape" | "fixture";
  error: string | null;
}> {
  if (!envFlag("FIRECRAWL_API_KEY")) {
    return { sources: fixtureSources(product), origin: "fixture", error: "FIRECRAWL_API_KEY unset" };
  }
  try {
    const scraped = await scrapeAllSources(product.name);
    if (scraped.length === 0) {
      return {
        sources: fixtureSources(product),
        origin: "fixture",
        error: "live scrape returned 0 sources, falling back to fixtures",
      };
    }
    return {
      sources: scraped.map((source) => ({
        ...source,
        originalLanguageCode: "en-IN",
        translatedToEnglish: false,
      })),
      origin: "live-scrape",
      error: null,
    };
  } catch (error) {
    return {
      sources: fixtureSources(product),
      origin: "fixture",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function measureCache(slugs: string[]) {
  const notes: string[] = [];
  const redisConfigured = envFlag("UPSTASH_REDIS_REST_URL") && envFlag("UPSTASH_REDIS_REST_TOKEN");
  if (!redisConfigured) {
    notes.push(
      "UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is unset. Product cache functions catch Redis errors and return null, so every lookup is a miss.",
    );
  }

  const review = dummyReview();
  const perLookup: Array<{
    slug: string;
    pass: "cold" | "repeat";
    hit: boolean;
    via: "localized" | "review" | "miss";
  }> = [];

  async function lookup(slug: string, pass: "cold" | "repeat"): Promise<void> {
    const localized = await getCachedLocalized(slug, LANGUAGE);
    if (localized) {
      perLookup.push({ slug, pass, hit: true, via: "localized" });
      return;
    }
    const cached = await getCachedReview(slug);
    if (cached) {
      perLookup.push({ slug, pass, hit: true, via: "review" });
      return;
    }
    perLookup.push({ slug, pass, hit: false, via: "miss" });
    await setCachedReview(slug, review);
    await setCachedLocalized(slug, LANGUAGE, {
      review,
      audioUrl: null,
      durationSeconds: null,
      ttsLanguageCode: LANGUAGE,
    });
  }

  for (const slug of slugs) {
    await lookup(slug, "cold");
  }
  for (const slug of slugs) {
    await lookup(slug, "repeat");
  }

  const lookups = perLookup.length;
  const hits = perLookup.filter((row) => row.hit).length;
  notes.push(
    `Workload is ${slugs.length} unique slugs, then the same ${slugs.length} slugs again. A working cache should hit on the second pass. Expected hit rate if Redis works is 0.5.`,
  );
  return {
    lookups,
    hits,
    misses: lookups - hits,
    hitRate: lookups === 0 ? 0 : hits / lookups,
    redisConfigured,
    notes,
    perLookup,
  };
}

function markdownTable(rows: Array<[string, string]>): string {
  const lines = ["| Metric | Result |", "|---|---|"];
  for (const [metric, result] of rows) {
    lines.push(`| ${metric} | ${result} |`);
  }
  return lines.join("\n");
}

function formatMetric(metric: Metric): string {
  if (metric.status === "failed") {
    return `failed: ${metric.error}`;
  }
  if (metric.unit === "rate") {
    return `${(metric.value * 100).toFixed(1)}% (${metric.detail})`;
  }
  if (metric.unit === "usd") {
    return `$${metric.value.toFixed(4)} (${metric.detail})`;
  }
  return `${metric.value} ${metric.unit} (${metric.detail})`;
}

async function main(): Promise<void> {
  loadDotEnv();
  const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as DatasetFile;
  const measuredAt = new Date().toISOString();
  const hardware = hardwareInfo();
  const checks = instrumentChecks();
  const failures: string[] = [];

  if (checks.some((check) => !check.passed)) {
    failures.push("claim checker instrument checks failed");
  }

  const productRows: ProductRow[] = [];
  let liveSynthesisCalls = 0;
  let liveScrapeCalls = 0;
  let estimatedInputChars = 0;
  let estimatedOutputChars = 0;

  for (const product of dataset.products) {
    const slug = `gs-t7-${toSlug(product.name)}`;
    const loaded = await loadSources(product);
    if (loaded.origin === "live-scrape") {
      liveScrapeCalls += 1;
    }
    const sourceText = loaded.sources.map((source) => source.content).join("\n");

    let synthesisStatus: "ok" | "failed" = "failed";
    let synthesisError: string | null = null;
    let summary: string | null = null;
    const claimDetails: ClaimJudgement[] = [];

    if (!envFlag("SARVAM_API_KEY")) {
      synthesisError = "SARVAM_API_KEY unset, synthesizeReview was not called";
    } else {
      try {
        const synthesized = await synthesizeReview({
          traceId: `gs-t7-${slug}`,
          productName: product.name,
          sources: loaded.sources,
        });
        liveSynthesisCalls += 1;
        synthesisStatus = "ok";
        summary = synthesized.summary;
        estimatedInputChars += sourceText.length;
        estimatedOutputChars += synthesized.summary.length + synthesized.tldr.length;
        for (const claim of extractSummaryClaims(synthesized.summary)) {
          claimDetails.push(judgeClaim(claim, sourceText));
        }
      } catch (error) {
        synthesisError = error instanceof Error ? error.message : String(error);
      }
    }

    const claims = claimDetails.length;
    const absentClaims = claimDetails.filter((row) => !row.grounded).length;

    productRows.push({
      name: product.name,
      slug,
      sourceOrigin: loaded.origin,
      sourceLoadError: loaded.error,
      sourceCount: loaded.sources.length,
      sourceChars: sourceText.length,
      synthesisStatus,
      synthesisError,
      summaryChars: summary ? summary.length : null,
      claims,
      absentClaims,
      absentClaimRate: claims === 0 ? null : absentClaims / claims,
      claimDetails,
    });
  }

  const previousError = console.error;
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("[cache]")) {
      return;
    }
    previousError(...args);
  };
  let cache: Awaited<ReturnType<typeof measureCache>>;
  try {
    cache = await measureCache(productRows.map((row) => row.slug));
  } finally {
    console.error = previousError;
  }

  const synthesizedOk = productRows.filter((row) => row.synthesisStatus === "ok");
  const totalClaims = synthesizedOk.reduce((sum, row) => sum + row.claims, 0);
  const totalAbsent = synthesizedOk.reduce((sum, row) => sum + row.absentClaims, 0);

  let absentMetric: Metric;
  if (synthesizedOk.length === 0) {
    const reasons = [...new Set(productRows.map((row) => row.synthesisError).filter(Boolean))];
    absentMetric = {
      status: "failed",
      value: null,
      unit: "rate",
      error: `No summaries produced. ${reasons.join("; ") || "unknown synthesis failure"}`,
    };
    failures.push("absent_claim_rate: no summaries");
  } else if (totalClaims === 0) {
    absentMetric = {
      status: "failed",
      value: null,
      unit: "rate",
      error: `${synthesizedOk.length} summaries produced but claim splitter found 0 summary sentences with at least 4 content tokens`,
    };
    failures.push("absent_claim_rate: zero claims extracted");
  } else {
    absentMetric = {
      status: "ok",
      value: totalAbsent / totalClaims,
      unit: "rate",
      detail: `${totalAbsent}/${totalClaims} summary claims not grounded in source text, overlap threshold ${GROUNDING_OVERLAP}`,
    };
  }

  const cacheMetric: Metric = {
    status: "ok",
    value: cache.hitRate,
    unit: "rate",
    detail: `${cache.hits}/${cache.lookups} hits. redisConfigured=${cache.redisConfigured}. ${cache.notes.join(" ")}`,
  };

  let costMetric: Metric;
  if (liveSynthesisCalls === 0 && liveScrapeCalls === 0) {
    costMetric = {
      status: "failed",
      value: null,
      unit: "usd",
      error:
        "No live Firecrawl or Sarvam calls ran. SARVAM_API_KEY and FIRECRAWL_API_KEY are unset or every call failed. This bench will not report $0 as product cost, because that would describe the missing keys, not a query.",
    };
    failures.push("cost_per_query: no live API calls");
  } else if (liveSynthesisCalls > 0) {
    costMetric = {
      status: "failed",
      value: null,
      unit: "usd",
      error:
        `Ran ${liveSynthesisCalls} sarvam-m synthesize calls and ${liveScrapeCalls} Firecrawl scrapes. Official sarvam-m chat list price is unpublished on docs.sarvam.ai as of 2026-08-24. Estimated chars input=${estimatedInputChars} output=${estimatedOutputChars}. Firecrawl Hobby yearly equivalent is about $0.0032 per credit, but this run will not mint a query price without a published sarvam-m rate.`,
    };
    failures.push("cost_per_query: sarvam-m list price unpublished");
  } else {
    const firecrawlCreditsApprox = liveScrapeCalls * (3 * 2 + 6);
    const usd = firecrawlCreditsApprox * 0.0032;
    costMetric = {
      status: "ok",
      value: usd / Math.max(liveScrapeCalls, 1),
      unit: "usd",
      detail:
        `Firecrawl-only estimate. ${liveScrapeCalls} scrapeAllSources calls. Credits approximated as 3 searches plus 6 scrapes per product = ${firecrawlCreditsApprox} credits at $0.0032/credit Hobby yearly (firecrawl.dev/pricing). Synthesis did not run.`,
    };
  }

  const result = {
    task: "GS-T7",
    measured_at: measuredAt,
    model: SYNTHESIS_MODEL,
    dataset_size: dataset.products.length,
    hardware,
    command: "npm run bench:gs-t7",
    closest_harness: {
      path: "src/app/api/query/latency-budget.test.ts",
      decision: "new",
      reason:
        "It is the only pipeline-level harness that already records cache hit vs miss on the query path, but it mocks scrape, synthesis, and Redis, so it cannot record live absent-claim rate or cost.",
    },
    method: {
      absent_claims:
        "Split the synthesized summary into sentences. A sentence is a claim if it has at least 4 content tokens. A claim is absent unless every number in it appears in source text and at least 60% of content tokens overlap the source token set. Threshold chosen before the run. Fixture sources are used only when Firecrawl is unset or returns nothing.",
      cache:
        "Call getCachedLocalized then getCachedReview for each slug, matching src/app/api/query/route.ts. Cold pass for every product, then a repeat pass. Hit if either lookup returns data. Uses the product cache functions, not a private Map.",
      cost:
        "Count live Firecrawl and Sarvam calls this process actually made. Do not invent a billed query cost when those calls did not happen.",
    },
    env: {
      SARVAM_API_KEY: envFlag("SARVAM_API_KEY"),
      FIRECRAWL_API_KEY: envFlag("FIRECRAWL_API_KEY"),
      GEMINI_API_KEY: envFlag("GEMINI_API_KEY"),
      UPSTASH_REDIS_REST_URL: envFlag("UPSTASH_REDIS_REST_URL"),
      UPSTASH_REDIS_REST_TOKEN: envFlag("UPSTASH_REDIS_REST_TOKEN"),
    },
    instrument_checks: checks,
    live_calls: {
      synthesizeReview: liveSynthesisCalls,
      scrapeAllSources: liveScrapeCalls,
      estimatedInputChars,
      estimatedOutputChars,
    },
    metrics: {
      absent_claim_rate: absentMetric,
      cache_hit_rate: cacheMetric,
      cost_per_query_usd: costMetric,
    },
    cache,
    products: productRows,
    failures,
  };

  writeFileSync(RESULTS_PATH, `${JSON.stringify(result, null, 2)}\n`);

  const table = markdownTable([
    ["Task", "GS-T7"],
    ["Model", SYNTHESIS_MODEL],
    ["Date", measuredAt],
    ["Dataset size", String(dataset.products.length)],
    ["Hardware", `${hardware.cpuModel}, ${hardware.cpuCount} cores, ${hardware.ramGiB} GiB RAM, ${hardware.platform}/${hardware.arch}, Node ${hardware.node}`],
    ["Absent-claim rate", formatMetric(absentMetric)],
    ["Cache hit rate", formatMetric(cacheMetric)],
    ["Cost per query", formatMetric(costMetric)],
  ]);

  console.log(table);
  console.log("");
  console.log(`Wrote ${RESULTS_PATH}`);
  if (failures.length > 0) {
    console.log(`Failures recorded: ${failures.join(" | ")}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
