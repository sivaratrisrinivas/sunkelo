import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import { checkRateLimit } from "@/lib/cache/rate-limit";
import {
  getCachedReview,
  setCachedReview,
  getCachedLocalized,
  setCachedLocalized,
  type CachedReview,
  type CachedLocalized,
} from "@/lib/cache/reviews";
import { createReview } from "@/lib/db/reviews";
import { insertLog } from "@/lib/db/query-logs";
import { listTrending, upsertProductBySlug } from "@/lib/db/products";
import { scrapeAllSources } from "@/lib/firecrawl/scraper";
import { extractIntentAndEntity, resolveCanonicalSlug } from "@/lib/pipeline/entity";
import { getLocalizedErrorMessage } from "@/lib/pipeline/localized-errors";
import { localizeReview } from "@/lib/pipeline/localize";
import { normalizeSourcesToEnglish } from "@/lib/pipeline/normalize-sources";
import { createSSEStream } from "@/lib/pipeline/orchestrator";
import { detectQueryLanguageCode } from "@/lib/pipeline/query-language";
import {
  collectReviewEvidence,
  getStrictEvidencePolicy,
  hasEnoughUserReviewEvidence,
} from "../../../lib/pipeline/review-evidence";
import { synthesizeReview } from "@/lib/pipeline/synthesize";
import { transcribeAudio } from "@/lib/sarvam/stt";
import { MAX_AUDIO_UPLOAD_BYTES } from "@/lib/utils/constants";
import { hashIpFromHeader } from "@/lib/utils/ip-hash";

type QueryPayload =
  | { kind: "text"; text: string }
  | { kind: "audio"; audio: Buffer }
  | { kind: "invalid"; message: string };

async function parsePayload(request: NextRequest): Promise<QueryPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = await request.json().catch(() => ({}));
    const text = typeof json.text === "string" ? json.text.trim() : "";
    if (!text) {
      return { kind: "invalid", message: "Text query cannot be empty" };
    }
    return { kind: "text", text };
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return { kind: "invalid", message: "Audio file is required" };
    }
    if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
      return { kind: "invalid", message: "Audio file exceeds 10MB limit" };
    }
    const arrayBuffer = await file.arrayBuffer();
    return { kind: "audio", audio: Buffer.from(arrayBuffer) };
  }

  return { kind: "invalid", message: "Unsupported content type" };
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function getNoReviewSuggestions(): Promise<string[]> {
  try {
    const trending = await listTrending(3);
    const names = trending.map((product) => `${product.brand} ${product.model}`.trim()).filter(Boolean);
    if (names.length > 0) {
      return names;
    }
  } catch {
    // Fall back to static suggestions when DB is unavailable.
  }

  return ["Redmi Note 15", "Samsung Galaxy S24", "iPhone 16"];
}

export async function POST(request: NextRequest) {
  const traceId = randomUUID();
  const pipelineStartMs = Date.now();
  const strictEvidencePolicy = getStrictEvidencePolicy();
  const ipHash = hashIpFromHeader(request.headers.get("x-forwarded-for"));
  const rate = await checkRateLimit(ipHash);

  const stream = createSSEStream(async (emitEvent) => {
    // --- tracking state for query log ---
    let logTranscript: string | undefined;
    let logLanguage: string | undefined;
    let logIntent: string | undefined;
    let logProductId: number | undefined;
    let logCacheHit = false;

    const emitDoneAndLog = (extra?: Record<string, unknown>) => {
      const latencyMs = Date.now() - pipelineStartMs;
      emitEvent("done", {
        cached: logCacheHit,
        remaining: rate.remaining,
        ...extra,
      });
      // Fire-and-forget query log
      insertLog({
        ipHash,
        transcript: logTranscript,
        languageCode: logLanguage,
        intent: logIntent,
        productId: logProductId,
        cacheHit: logCacheHit,
        latencyMs,
      }).catch(() => { });
    };

    if (!rate.allowed) {
      const message = await getLocalizedErrorMessage("RATE_LIMITED", "en-IN");
      emitEvent("error", {
        code: "RATE_LIMITED",
        message,
        remaining: rate.remaining,
        resetAt: rate.resetAt,
      });
      emitDoneAndLog();
      return;
    }

    const payload = await parsePayload(request);
    if (payload.kind === "invalid") {
      const message = await getLocalizedErrorMessage("INVALID_INPUT", "en-IN");
      emitEvent("error", { code: "INVALID_INPUT", message: message || payload.message });
      emitDoneAndLog();
      return;
    }

    emitEvent("status", { status: "listening" });

    const handleTranscript = async (transcript: string, language: string) => {
      logTranscript = transcript;
      logLanguage = language;

      console.info("[query] understood", { traceId, language, transcriptLength: transcript.length });
      emitEvent("status", {
        status: "understood",
        context: { transcript, language },
      });

      const extracted = await extractIntentAndEntity(transcript);
      logIntent = extracted.intent;

      if (extracted.intent === "unsupported") {
        const message = await getLocalizedErrorMessage("NOT_A_PRODUCT", language);
        emitEvent("error", {
          code: "NOT_A_PRODUCT",
          message,
        });
        emitDoneAndLog();
        return;
      }

      const extractedSlug = extracted.slug ?? "unknown-product";
      const canonicalSlug = await resolveCanonicalSlug({
        transcript,
        extractedSlug,
      });
      const productLabel = extracted.productName ?? titleFromSlug(canonicalSlug);

      // ----------------------------------------------------------------
      // CACHE CHECK: localized cache first (slug + language)
      // ----------------------------------------------------------------
      const cachedLocalized = await getCachedLocalized(canonicalSlug, language || "en-IN");
      if (cachedLocalized) {
        console.info("[cache] localized hit", { traceId, slug: canonicalSlug, language });
        logCacheHit = true;

        emitEvent("status", {
          status: "searching",
          context: { product: productLabel, productSlug: canonicalSlug, cached: true },
        });
        emitEvent("status", {
          status: "analyzing",
          context: { product: productLabel, productSlug: canonicalSlug, cached: true },
        });

        emitEvent("review", {
          product: {
            slug: canonicalSlug,
            brand: extracted.brand ?? "Unknown",
            model: extracted.model ?? productLabel,
          },
          verdict: cachedLocalized.review.verdict,
          confidenceScore: cachedLocalized.review.confidenceScore,
          pros: cachedLocalized.review.pros,
          cons: cachedLocalized.review.cons,
          bestFor: cachedLocalized.review.bestFor,
          summary: cachedLocalized.review.summary,
          tldr: cachedLocalized.review.tldr,
          sources: cachedLocalized.review.sources,
          language: language || "en-IN",
        });

        if (cachedLocalized.audioUrl) {
          emitEvent("audio", {
            audioUrl: cachedLocalized.audioUrl,
            durationSeconds: cachedLocalized.durationSeconds,
            language: cachedLocalized.ttsLanguageCode,
          });
        }

        emitDoneAndLog({ sourceCount: cachedLocalized.review.sources?.length });
        return;
      }

      // ----------------------------------------------------------------
      // CACHE CHECK: review cache (slug only, English base review)
      // ----------------------------------------------------------------
      const cachedReview = await getCachedReview(canonicalSlug);

      emitEvent("status", {
        status: "searching",
        context: {
          product: productLabel,
          productSlug: canonicalSlug,
        },
      });

      let review: CachedReview;
      let reviewId: number | null = null;

      if (cachedReview) {
        // Cache hit: skip scrape + normalize + synthesize
        console.info("[cache] review hit", { traceId, slug: canonicalSlug });
        logCacheHit = true;
        review = cachedReview;
        reviewId = cachedReview.reviewId ?? null;
        logProductId = cachedReview.productId ?? undefined;
      } else {
        // Cache miss: full pipeline
        console.info("[cache] review miss", { traceId, slug: canonicalSlug });

        const scrapedSources = await scrapeAllSources(productLabel);
        const normalizedSources = await normalizeSourcesToEnglish(scrapedSources);
        const reviewEvidence = collectReviewEvidence(normalizedSources);
        console.info("[query] sources ready", {
          traceId,
          productLabel,
          scrapedCount: scrapedSources.length,
          normalizedCount: normalizedSources.length,
          strictEvidencePolicy,
          reviewEvidence,
        });

        if (normalizedSources.length < 2) {
          const suggestions = await getNoReviewSuggestions();
          const message = await getLocalizedErrorMessage("NO_REVIEWS", language);
          emitEvent("error", {
            code: "NO_REVIEWS",
            message,
            suggestions,
          });
          emitDoneAndLog({ sourceCount: normalizedSources.length });
          return;
        }

        if (!hasEnoughUserReviewEvidence(reviewEvidence, strictEvidencePolicy)) {
          const suggestions = await getNoReviewSuggestions();
          const message = await getLocalizedErrorMessage("INSUFFICIENT_USER_REVIEW_EVIDENCE", language);
          emitEvent("error", {
            code: "INSUFFICIENT_USER_REVIEW_EVIDENCE",
            message,
            suggestions,
            reviewEvidence,
            policy: strictEvidencePolicy,
          });
          emitDoneAndLog({ sourceCount: normalizedSources.length });
          return;
        }

        emitEvent("status", {
          status: "analyzing",
          context: {
            product: productLabel,
            productSlug: canonicalSlug,
            sourceCount: normalizedSources.length,
          },
        });

        const synthesized = await synthesizeReview({
          traceId,
          productName: productLabel,
          sources: normalizedSources,
        }).catch((error) => {
          console.error("[query] synthesize failed", {
            traceId,
            productLabel,
            error: error instanceof Error ? error.message : String(error),
            details:
              error && typeof error === "object" && "details" in error
                ? (error as { details?: unknown }).details
                : undefined,
          });
          return null;
        });

        if (!synthesized) {
          const message = await getLocalizedErrorMessage("SERVICE_UNAVAILABLE", language);
          emitEvent("error", {
            code: "SERVICE_UNAVAILABLE",
            message,
          });
          emitDoneAndLog();
          return;
        }

        // Persist to DB
        try {
          const product = await upsertProductBySlug({
            slug: canonicalSlug,
            brand: extracted.brand,
            model: extracted.model ?? productLabel,
          });

          logProductId = product.id;

          reviewId = await createReview({
            productId: product.id,
            languageCode: "en-IN",
            verdict: synthesized.verdict,
            confidenceScore: synthesized.confidenceScore,
            summary: synthesized.summary,
            tldr: synthesized.tldr,
            pros: synthesized.pros,
            cons: synthesized.cons,
            bestFor: synthesized.bestFor,
            sources: synthesized.sources,
          });
        } catch {
          // Keep response streaming even when persistence fails.
        }

        review = {
          ...synthesized,
          reviewId,
          productId: logProductId ?? null,
        };

        // Cache the English base review
        await setCachedReview(canonicalSlug, review);
      }

      // ----------------------------------------------------------------
      // LOCALIZE: translate + TTS (or serve from localized cache)
      // ----------------------------------------------------------------
      let localizedReview = review;
      let audioUrl: string | null = null;
      let durationSeconds: number | null = null;
      let audioLanguage = language || "en-IN";

      try {
        const localized = await localizeReview({
          reviewId: reviewId ?? 0,
          productSlug: canonicalSlug,
          productName: productLabel,
          review,
          languageCode: language || "en-IN",
        });
        localizedReview = localized.review;
        audioUrl = localized.audioUrl;
        durationSeconds = localized.durationSeconds;
        audioLanguage = localized.ttsLanguageCode;

        // Cache the localized result
        await setCachedLocalized(canonicalSlug, language || "en-IN", {
          review: localizedReview,
          audioUrl,
          durationSeconds,
          ttsLanguageCode: audioLanguage,
        });
      } catch {
        // Keep streaming response even if localization pipeline fails.
      }

      emitEvent("review", {
        product: {
          slug: canonicalSlug,
          brand: extracted.brand ?? "Unknown",
          model: extracted.model ?? productLabel,
        },
        verdict: localizedReview.verdict,
        confidenceScore: localizedReview.confidenceScore,
        pros: localizedReview.pros,
        cons: localizedReview.cons,
        bestFor: localizedReview.bestFor,
        summary: localizedReview.summary,
        tldr: localizedReview.tldr,
        sources: localizedReview.sources,
        language: language || "en-IN",
        reviewEvidence: logCacheHit ? undefined : collectReviewEvidence([]),
      });

      if (audioUrl) {
        emitEvent("audio", {
          audioUrl,
          durationSeconds,
          language: audioLanguage,
        });
      }

      emitDoneAndLog({ sourceCount: localizedReview.sources?.length });
    };

    if (payload.kind === "text") {
      const textLanguage = await detectQueryLanguageCode(payload.text);
      await handleTranscript(payload.text, textLanguage);
      return;
    }

    try {
      const stt = await transcribeAudio(payload.audio);
      await handleTranscript(stt.transcript, stt.languageCode);
    } catch (error) {
      const message = await getLocalizedErrorMessage("STT_FAILED", "en-IN");
      emitEvent("error", {
        code: "STT_FAILED",
        message: message || (error instanceof Error ? error.message : "Failed to transcribe audio"),
      });
      emitDoneAndLog();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
