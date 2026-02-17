import { z } from "zod";

import { createChatCompletion } from "@/lib/sarvam/chat";
import type { NormalizedReviewSource } from "@/lib/pipeline/normalize-sources";

export const synthesizedReviewSchema = z.object({
  verdict: z.enum(["buy", "skip", "wait"]),
  pros: z.array(z.string().min(1)).min(1).max(5),
  cons: z.array(z.string().min(1)).min(1).max(5),
  bestFor: z.string().min(1),
  summary: z.string().min(100).max(2000),
  tldr: z.string().min(30).max(500),
  confidenceScore: z.number().min(0).max(1),
  sources: z
    .array(
      z.object({
        title: z.string().min(1),
        url: z.string().url(),
        type: z.enum(["blog", "ecommerce", "youtube"]).optional(),
        site: z.enum(["amazon", "flipkart", "myntra", "ajio", "unknown"]).optional(),
        productTitle: z.string().optional(),
        price: z.string().optional(),
        currency: z.string().optional(),
        overallRating: z.number().optional(),
        ratingsCount: z.number().optional(),
        reviewsCount: z.number().optional(),
        reviewSampleCount: z.number().int().nonnegative().optional(),
        averageReviewRating: z.number().optional(),
        sentimentBreakdown: z
          .object({
            positive: z.number().int().nonnegative(),
            negative: z.number().int().nonnegative(),
            neutral: z.number().int().nonnegative(),
            mixed: z.number().int().nonnegative(),
          })
          .optional(),
      }),
    )
    .min(1),
});

export type SynthesizedReview = z.infer<typeof synthesizedReviewSchema>;

export class SynthesisError extends Error {
  public readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "SynthesisError";
    this.details = details;
  }
}

const SYNTHESIS_SYSTEM_PROMPT = `
You are a product review synthesizer.
Given a product and multiple review sources, produce a balanced response as STRICT JSON.
Never include markdown fences, commentary, or extra keys.

Output shape:
{
  "verdict": "buy" | "skip" | "wait",
  "pros": string[] (1 to 5 items),
  "cons": string[] (1 to 5 items),
  "bestFor": string,
  "summary": string (100 to 2000 chars),
  "tldr": string (30 to 500 chars),
  "confidenceScore": number (0 to 1),
  "sources": [{"title": string, "url": string, "type": "blog" | "ecommerce" | "youtube"}]
}

Rules:
- Use only evidence from provided sources.
- Keep claims grounded and avoid invented specs.
- Match sources to the final citations list.
- If ecommerce sources are present, prioritize user-review sentiment from those sources in summary/pros/cons.
- Treat blog/youtube sources as expert context and ecommerce sources as user sentiment context.
`.trim();

function extractJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Synthesis response did not include a JSON object");
  }
  return raw.slice(start, end + 1);
}

const TEXT_FALLBACK_SYSTEM_PROMPT = `
You produce a structured review in plain text (NOT JSON).
Return EXACTLY this format and headings:

VERDICT: <buy|skip|wait>
CONFIDENCE: <0 to 1>
BEST_FOR: <single line>
SUMMARY: <single paragraph, at least 100 chars>
TLDR: <single paragraph, at least 30 chars>
PROS:
- <item 1>
- <item 2>
CONS:
- <item 1>
- <item 2>
SOURCES:
- <title> | <url> | <blog|ecommerce|youtube>

Rules:
- No markdown code fences.
- Keep headings exactly as written.
- Provide at least 1 pro, 1 con, and 1 source.
`.trim();

const SOURCE_MIN_CHARS_PER_ITEM = 120;
const SOURCE_MAX_CHARS_PER_ITEM = 900;
const SOURCE_MAX_TOTAL_CONTENT_CHARS = 8_000;
const TARGET_MAX_USER_PROMPT_CHARS = 12_000;

function normalizePromptContent(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

type PromptSource = {
  title: string;
  url: string;
  type: "blog" | "ecommerce" | "youtube";
  content: string;
  originalChars: number;
};

function compactSourcesForPrompt(sources: NormalizedReviewSource[]): {
  promptSources: PromptSource[];
  totalOriginalChars: number;
  totalCompactedChars: number;
} {
  const normalized = sources.map((source) => {
    const cleaned = normalizePromptContent(source.content);
    return {
      title: source.title,
      url: source.url,
      type: source.type,
      content: cleaned,
      originalChars: cleaned.length,
    };
  });

  const totalOriginalChars = normalized.reduce((sum, source) => sum + source.originalChars, 0);
  let remainingBudget = SOURCE_MAX_TOTAL_CONTENT_CHARS;

  // First pass: reserve a small floor for each source to preserve evidence diversity.
  const floorAssigned = normalized.map((source) => {
    const floor = Math.min(source.originalChars, SOURCE_MIN_CHARS_PER_ITEM, remainingBudget);
    remainingBudget -= floor;
    return floor;
  });

  // Second pass: distribute remaining budget in-order up to per-source max.
  const finalAssigned = normalized.map((source, index) => {
    const floor = floorAssigned[index];
    const hardCap = Math.min(source.originalChars, SOURCE_MAX_CHARS_PER_ITEM);
    const additionalRoom = Math.max(0, hardCap - floor);
    const additional = Math.min(additionalRoom, remainingBudget);
    remainingBudget -= additional;
    return floor + additional;
  });

  const promptSources: PromptSource[] = normalized.map((source, index) => {
    const assigned = finalAssigned[index];
    const clipped = source.content.slice(0, assigned).trim();
    return {
      title: source.title,
      url: source.url,
      type: source.type,
      content: clipped,
      originalChars: source.originalChars,
    };
  });

  const totalCompactedChars = promptSources.reduce((sum, source) => sum + source.content.length, 0);
  return { promptSources, totalOriginalChars, totalCompactedChars };
}

function buildSourceBlock(sources: PromptSource[]): string {
  return sources
    .map((source, index) => {
      const contextTag = source.type === "ecommerce" ? "USER_REVIEWS" : "EXPERT_OR_CONTENT";
      const wasTrimmed = source.content.length < source.originalChars;
      const content = wasTrimmed ? `${source.content} …[truncated]` : source.content;
      return [
        `Source ${index + 1}:`,
        `- Context: ${contextTag}`,
        `- Title: ${source.title}`,
        `- URL: ${source.url}`,
        `- Type: ${source.type}`,
        `- Content: ${content}`,
      ].join("\n");
    })
    .join("\n\n");
}

function coerceString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0)
      .slice(0, 5);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\n]/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5);
  }
  return [];
}

function coerceConfidenceScore(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0.6;
  return Math.max(0, Math.min(1, parsed));
}

function coerceVerdict(value: unknown): "buy" | "skip" | "wait" {
  if (value === "buy" || value === "skip" || value === "wait") {
    return value;
  }
  return "wait";
}

function ensureLength(value: string, min: number, fallback: string): string {
  const base = value.trim() || fallback;
  if (base.length >= min) return base;
  return `${base} ${fallback}`.trim().slice(0, Math.max(min, fallback.length));
}

function coerceSources(
  value: unknown,
  fallbackSources: NormalizedReviewSource[],
): Array<{
  title: string;
  url: string;
  type: "blog" | "ecommerce" | "youtube";
  site?: "amazon" | "flipkart" | "myntra" | "ajio" | "unknown";
  productTitle?: string;
  price?: string;
  currency?: string;
  overallRating?: number;
  ratingsCount?: number;
  reviewsCount?: number;
  reviewSampleCount?: number;
  averageReviewRating?: number;
  sentimentBreakdown?: {
    positive: number;
    negative: number;
    neutral: number;
    mixed: number;
  };
}> {
  const normalizeUrlKey = (value: string): string => value.replace(/\/+$/, "");
  const fallbackByUrl = new Map(
    fallbackSources.map((source) => {
      const overview = source.ecommerceOverview;
      return [
        normalizeUrlKey(source.url),
        {
          type: source.type,
          ...(overview
            ? {
                site: overview.site,
                productTitle: overview.productTitle,
                price: overview.price,
                currency: overview.currency,
                overallRating: overview.overallRating,
                ratingsCount: overview.ratingsCount,
                reviewsCount: overview.reviewsCount,
                reviewSampleCount: overview.reviewSampleCount,
                averageReviewRating: overview.averageReviewRating,
                sentimentBreakdown: overview.sentimentBreakdown,
              }
            : {}),
        },
      ] as const;
    }),
  );

  const fromValue = Array.isArray(value)
    ? value
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const candidate = item as Record<string, unknown>;
          const title = coerceString(candidate.title);
          const rawUrl = coerceString(candidate.url);
          const type = candidate.type;
          if (!title || !rawUrl) return null;
          try {
            const normalized = new URL(rawUrl).toString();
            const normalizedKey = normalizeUrlKey(normalized);
            const fallback = fallbackByUrl.get(normalizedKey);
            return {
              title,
              url: normalized,
              type:
                type === "blog" || type === "ecommerce" || type === "youtube"
                  ? type
                  : (fallback?.type ?? "blog"),
              ...(fallback ?? {}),
            };
          } catch {
            return null;
          }
        })
        .filter(
          (item): item is {
            title: string;
            url: string;
            type: "blog" | "ecommerce" | "youtube";
            site?: "amazon" | "flipkart" | "myntra" | "ajio" | "unknown";
            productTitle?: string;
            price?: string;
            currency?: string;
            overallRating?: number;
            ratingsCount?: number;
            reviewsCount?: number;
            reviewSampleCount?: number;
            averageReviewRating?: number;
            sentimentBreakdown?: {
              positive: number;
              negative: number;
              neutral: number;
              mixed: number;
            };
          } =>
            Boolean(item),
        )
    : [];

  if (fromValue.length > 0) {
    return fromValue;
  }

  return fallbackSources.slice(0, 5).map((source) => ({
    title: source.title,
    url: source.url,
    type: source.type,
    ...(source.ecommerceOverview
      ? {
          site: source.ecommerceOverview.site,
          productTitle: source.ecommerceOverview.productTitle,
          price: source.ecommerceOverview.price,
          currency: source.ecommerceOverview.currency,
          overallRating: source.ecommerceOverview.overallRating,
          ratingsCount: source.ecommerceOverview.ratingsCount,
          reviewsCount: source.ecommerceOverview.reviewsCount,
          reviewSampleCount: source.ecommerceOverview.reviewSampleCount,
          averageReviewRating: source.ecommerceOverview.averageReviewRating,
          sentimentBreakdown: source.ecommerceOverview.sentimentBreakdown,
        }
      : {}),
  }));
}

function coerceReviewShape(
  value: unknown,
  fallbackSources: NormalizedReviewSource[],
): SynthesizedReview {
  const candidate = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

  const pros = coerceStringArray(candidate.pros);
  const cons = coerceStringArray(candidate.cons);
  const summaryRaw = coerceString(candidate.summary) ?? "";
  const tldrRaw = coerceString(candidate.tldr ?? candidate.tl_dr) ?? "";
  const bestForRaw = coerceString(candidate.bestFor ?? candidate.best_for) ?? "General buyers";

  const result = {
    verdict: coerceVerdict(candidate.verdict),
    pros: pros.length ? pros : ["Balanced performance for typical users"],
    cons: cons.length ? cons : ["Some trade-offs depend on budget and use-case"],
    bestFor: bestForRaw,
    summary: ensureLength(
      summaryRaw,
      100,
      "This review is synthesized from multiple public sources and highlights practical trade-offs for buyers.",
    ),
    tldr: ensureLength(
      tldrRaw,
      30,
      "Solid option overall, but compare pricing and your usage before buying.",
    ),
    confidenceScore: coerceConfidenceScore(candidate.confidenceScore ?? candidate.confidence_score),
    sources: coerceSources(candidate.sources, fallbackSources),
  };

  const parsed = synthesizedReviewSchema.safeParse(result);
  if (!parsed.success) {
    throw new SynthesisError("Synthesis schema validation failed", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

function parseTextFallback(
  text: string,
  fallbackSources: NormalizedReviewSource[],
): SynthesizedReview {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const getValue = (prefix: string): string => {
    const line = lines.find((value) => value.toUpperCase().startsWith(prefix));
    if (!line) return "";
    return line.slice(prefix.length).trim();
  };

  const collectBullets = (section: string): string[] => {
    const sectionIndex = lines.findIndex((line) => line.toUpperCase() === section);
    if (sectionIndex === -1) return [];
    const values: string[] = [];
    for (let i = sectionIndex + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^[A-Z_]+:\s*/.test(line) || line.toUpperCase() === "PROS:" || line.toUpperCase() === "CONS:" || line.toUpperCase() === "SOURCES:") {
        break;
      }
      if (line.startsWith("- ")) {
        values.push(line.slice(2).trim());
      }
    }
    return values.filter(Boolean);
  };

  const sourceBullets = collectBullets("SOURCES:");
  const parsedSources = sourceBullets
    .map((bullet) => {
      const parts = bullet.split("|").map((part) => part.trim());
      if (parts.length < 2) return null;
      const [title, url, rawType] = parts;
      try {
        const normalizedUrl = new URL(url).toString();
        const type = rawType === "ecommerce" || rawType === "youtube" ? rawType : "blog";
        return {
          title: title || "Source",
          url: normalizedUrl,
          type,
        };
      } catch {
        return null;
      }
    })
    .filter(
      (item): item is { title: string; url: string; type: "blog" | "ecommerce" | "youtube" } =>
        Boolean(item),
    );

  return coerceReviewShape(
    {
      verdict: getValue("VERDICT:").toLowerCase(),
      confidenceScore: getValue("CONFIDENCE:"),
      bestFor: getValue("BEST_FOR:"),
      summary: getValue("SUMMARY:"),
      tldr: getValue("TLDR:"),
      pros: collectBullets("PROS:"),
      cons: collectBullets("CONS:"),
      sources: parsedSources,
    },
    fallbackSources,
  );
}

export async function synthesizeReview(params: {
  traceId?: string;
  productName: string;
  sources: NormalizedReviewSource[];
}): Promise<SynthesizedReview> {
  const sourceSizeStats = params.sources.map((source, index) => ({
    index: index + 1,
    type: source.type,
    titleChars: source.title.length,
    contentChars: source.content.length,
    urlChars: source.url.length,
  }));
  const totalSourceContentChars = params.sources.reduce((sum, source) => sum + source.content.length, 0);
  console.info("[synthesize] request stats", {
    traceId: params.traceId,
    productName: params.productName,
    sourceCount: params.sources.length,
    totalSourceContentChars,
    sourceSizeStats,
  });

  const compacted = compactSourcesForPrompt(params.sources);
  const userPrompt = [
    `Product: ${params.productName}`,
    "",
    "Use the following sources:",
    buildSourceBlock(compacted.promptSources),
  ].join("\n");
  console.info("[synthesize] prompt stats", {
    traceId: params.traceId,
    productName: params.productName,
    userPromptChars: userPrompt.length,
    targetMaxUserPromptChars: TARGET_MAX_USER_PROMPT_CHARS,
    compactedSourceChars: compacted.totalCompactedChars,
    originalSourceChars: compacted.totalOriginalChars,
    sourceCharReduction: compacted.totalOriginalChars - compacted.totalCompactedChars,
  });

  if (userPrompt.length > TARGET_MAX_USER_PROMPT_CHARS) {
    console.warn("[synthesize] prompt still above target after compaction", {
      traceId: params.traceId,
      productName: params.productName,
      userPromptChars: userPrompt.length,
      targetMaxUserPromptChars: TARGET_MAX_USER_PROMPT_CHARS,
    });
  }

  let content: string;
  try {
    content = await createChatCompletion({
      model: "sarvam-m",
      temperature: 0.3,
      messages: [
        { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
  } catch (error) {
    console.error("[synthesize] initial chat call failed", {
      traceId: params.traceId,
      productName: params.productName,
      sourceCount: params.sources.length,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new SynthesisError("Synthesis chat call failed", {
      stage: "initial_chat",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const parsedJson = JSON.parse(extractJsonObject(content));
    return coerceReviewShape(parsedJson, params.sources);
  } catch {
    console.warn("[synthesize] initial parse failed, using text fallback", {
      traceId: params.traceId,
      productName: params.productName,
    });
    try {
      const textFallback = await createChatCompletion({
        model: "sarvam-m",
        temperature: 0,
        messages: [
          { role: "system", content: TEXT_FALLBACK_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              `Product: ${params.productName}`,
              "",
              "Context:",
              content,
              "",
              "If context is malformed, still produce best-effort structured output.",
            ].join("\n"),
          },
        ],
      });
      const parsed = parseTextFallback(textFallback, params.sources);
      console.info("[synthesize] text fallback succeeded", {
        traceId: params.traceId,
        productName: params.productName,
        sourceCount: parsed.sources.length,
      });
      return parsed;
    } catch (fallbackError) {
      if (fallbackError instanceof SynthesisError) {
        throw fallbackError;
      }
      throw new SynthesisError("Failed to synthesize review", {
        stage: "fallback_text_parse",
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
    }
  }
}
