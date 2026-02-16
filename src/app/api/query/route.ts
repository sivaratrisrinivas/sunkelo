import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import { checkRateLimit } from "@/lib/cache/rate-limit";
import { createReview } from "@/lib/db/reviews";
import { listTrending, upsertProductBySlug } from "@/lib/db/products";
import { scrapeAllSources } from "@/lib/firecrawl/scraper";
import { extractIntentAndEntity, resolveCanonicalSlug } from "@/lib/pipeline/entity";
import { normalizeSourcesToEnglish } from "@/lib/pipeline/normalize-sources";
import { createSSEStream } from "@/lib/pipeline/orchestrator";
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
  const strictEvidencePolicy = getStrictEvidencePolicy();
  const ipHash = hashIpFromHeader(request.headers.get("x-forwarded-for"));
  const rate = await checkRateLimit(ipHash);

  const stream = createSSEStream(async (emitEvent) => {
    if (!rate.allowed) {
      emitEvent("error", {
        code: "RATE_LIMITED",
        message: "Daily query limit reached",
        remaining: rate.remaining,
        resetAt: rate.resetAt,
      });
      emitEvent("done", { cached: false, remaining: rate.remaining });
      return;
    }

    const payload = await parsePayload(request);
    if (payload.kind === "invalid") {
      emitEvent("error", { code: "INVALID_INPUT", message: payload.message });
      emitEvent("done", { cached: false, remaining: rate.remaining });
      return;
    }

    emitEvent("status", { status: "listening" });

    const handleTranscript = async (transcript: string, language: string) => {
      console.info("[query] understood", { traceId, language, transcriptLength: transcript.length });
      emitEvent("status", {
        status: "understood",
        context: { transcript, language },
      });

      const extracted = await extractIntentAndEntity(transcript);
      if (extracted.intent === "unsupported") {
        emitEvent("error", {
          code: "NOT_A_PRODUCT",
          message: "Ask about any product review or comparison (phone, laptop, TV, earbuds, etc).",
        });
        emitEvent("done", { cached: false, remaining: rate.remaining });
        return;
      }

      const extractedSlug = extracted.slug ?? "unknown-product";
      const canonicalSlug = await resolveCanonicalSlug({
        transcript,
        extractedSlug,
      });
      const productLabel = extracted.productName ?? titleFromSlug(canonicalSlug);

      emitEvent("status", {
        status: "searching",
        context: {
          product: productLabel,
          productSlug: canonicalSlug,
        },
      });

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
        emitEvent("error", {
          code: "NO_REVIEWS",
          message: "This product doesn't have enough reviews yet. Try another popular phone.",
          suggestions,
        });
        emitEvent("done", { cached: false, remaining: rate.remaining, sourceCount: normalizedSources.length });
        return;
      }

      if (!hasEnoughUserReviewEvidence(reviewEvidence, strictEvidencePolicy)) {
        const suggestions = await getNoReviewSuggestions();
        emitEvent("error", {
          code: "INSUFFICIENT_USER_REVIEW_EVIDENCE",
          message: "Not enough user-review evidence. Try another product.",
          suggestions,
          reviewEvidence,
          policy: strictEvidencePolicy,
        });
        emitEvent("done", { cached: false, remaining: rate.remaining, sourceCount: normalizedSources.length });
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

      const review = await synthesizeReview({
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

      if (!review) {
        emitEvent("error", {
          code: "SERVICE_UNAVAILABLE",
          message: "Unable to analyze reviews right now. Please try again in a moment.",
        });
        emitEvent("done", { cached: false, remaining: rate.remaining });
        return;
      }

      try {
        const product = await upsertProductBySlug({
          slug: canonicalSlug,
          brand: extracted.brand,
          model: extracted.model ?? productLabel,
        });

        await createReview({
          productId: product.id,
          languageCode: "en-IN",
          verdict: review.verdict,
          confidenceScore: review.confidenceScore,
          summary: review.summary,
          tldr: review.tldr,
          pros: review.pros,
          cons: review.cons,
          bestFor: review.bestFor,
          sources: review.sources,
        });
      } catch {
        // Keep response streaming even when persistence fails.
      }

      emitEvent("review", {
        product: {
          slug: canonicalSlug,
          brand: extracted.brand ?? "Unknown",
          model: extracted.model ?? productLabel,
        },
        verdict: review.verdict,
        confidenceScore: review.confidenceScore,
        pros: review.pros,
        cons: review.cons,
        bestFor: review.bestFor,
        summary: review.summary,
        tldr: review.tldr,
        sources: review.sources,
        language,
        reviewEvidence,
      });

      emitEvent("done", {
        cached: false,
        remaining: rate.remaining,
        sourceCount: normalizedSources.length,
      });
    };

    if (payload.kind === "text") {
      await handleTranscript(payload.text, "en-IN");
      return;
    }

    try {
      const stt = await transcribeAudio(payload.audio);
      await handleTranscript(stt.transcript, stt.languageCode);
    } catch (error) {
      emitEvent("error", {
        code: "STT_FAILED",
        message: error instanceof Error ? error.message : "Failed to transcribe audio",
      });
      emitEvent("done", { cached: false, remaining: rate.remaining });
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
