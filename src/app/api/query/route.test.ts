import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockCheckRateLimit = vi.fn();
const mockTranscribeAudio = vi.fn();
const mockExtractIntentAndEntity = vi.fn();
const mockResolveCanonicalSlug = vi.fn();
const mockScrapeAllSources = vi.fn();
const mockNormalizeSourcesToEnglish = vi.fn();
const mockSynthesizeReview = vi.fn();
const mockLocalizeReview = vi.fn();
const mockGetLocalizedErrorMessage = vi.fn();
const mockDetectQueryLanguageCode = vi.fn();
const mockUpsertProductBySlug = vi.fn();
const mockCreateReview = vi.fn();
const mockListTrending = vi.fn();

vi.mock("@/lib/cache/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@/lib/sarvam/stt", () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
}));

vi.mock("@/lib/pipeline/entity", () => ({
  extractIntentAndEntity: (...args: unknown[]) => mockExtractIntentAndEntity(...args),
  resolveCanonicalSlug: (...args: unknown[]) => mockResolveCanonicalSlug(...args),
}));

vi.mock("@/lib/firecrawl/scraper", () => ({
  scrapeAllSources: (...args: unknown[]) => mockScrapeAllSources(...args),
}));

vi.mock("@/lib/pipeline/normalize-sources", () => ({
  normalizeSourcesToEnglish: (...args: unknown[]) => mockNormalizeSourcesToEnglish(...args),
}));

vi.mock("@/lib/pipeline/synthesize", () => ({
  synthesizeReview: (...args: unknown[]) => mockSynthesizeReview(...args),
}));

vi.mock("@/lib/pipeline/localize", () => ({
  localizeReview: (...args: unknown[]) => mockLocalizeReview(...args),
}));

vi.mock("@/lib/pipeline/localized-errors", () => ({
  getLocalizedErrorMessage: (...args: unknown[]) => mockGetLocalizedErrorMessage(...args),
}));

vi.mock("@/lib/pipeline/query-language", () => ({
  detectQueryLanguageCode: (...args: unknown[]) => mockDetectQueryLanguageCode(...args),
}));

vi.mock("@/lib/db/products", () => ({
  upsertProductBySlug: (...args: unknown[]) => mockUpsertProductBySlug(...args),
  listTrending: (...args: unknown[]) => mockListTrending(...args),
}));

vi.mock("@/lib/db/reviews", () => ({
  createReview: (...args: unknown[]) => mockCreateReview(...args),
}));

vi.mock("@/lib/pipeline/orchestrator", () => ({
  createSSEStream: (run: (emitEvent: (type: string, data: unknown) => void) => Promise<void> | void) => {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const emitEvent = (type: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        await run(emitEvent);
        controller.close();
      },
    });
  },
}));

vi.mock("@/lib/utils/constants", () => ({
  MAX_AUDIO_UPLOAD_BYTES: 10 * 1024 * 1024,
}));

vi.mock("@/lib/utils/ip-hash", () => ({
  hashIpFromHeader: () => "hashed-ip",
}));

import { POST } from "./route";

type ParsedSSEEvent = {
  type: string;
  data: Record<string, unknown>;
};

function parseSSE(raw: string): ParsedSSEEvent[] {
  const blocks = raw
    .split("\n\n")
    .map((value) => value.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const lines = block.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event: "));
    const dataLine = lines.find((line) => line.startsWith("data: "));
    return {
      type: eventLine?.replace("event: ", "") ?? "",
      data: JSON.parse(dataLine?.replace("data: ", "") ?? "{}"),
    };
  });
}

describe("POST /api/query sprint 3 flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 1000,
    });
    mockScrapeAllSources.mockResolvedValue([
      { url: "https://example.com/1", title: "R1", type: "blog", content: "raw content" },
      { url: "https://example.com/2", title: "R2", type: "youtube", content: "raw content 2" },
    ]);
    mockNormalizeSourcesToEnglish.mockResolvedValue([
      {
        url: "https://example.com/1",
        title: "R1",
        type: "blog",
        content: "normalized english",
        translatedToEnglish: false,
        originalLanguageCode: "en-IN",
      },
      {
        url: "https://example.com/2",
        title: "R2",
        type: "youtube",
        content: "normalized english 2",
        translatedToEnglish: false,
        originalLanguageCode: "en-IN",
      },
    ]);
    mockSynthesizeReview.mockResolvedValue({
      verdict: "buy",
      pros: ["Good battery"],
      cons: ["Average speaker"],
      bestFor: "Budget buyers",
      summary: "A".repeat(180),
      tldr: "A budget phone with strong battery and decent camera for everyday users.",
      confidenceScore: 0.78,
      sources: [
        { title: "R1", url: "https://example.com/1", type: "blog" },
        { title: "R2", url: "https://example.com/2", type: "youtube" },
      ],
    });
    mockUpsertProductBySlug.mockResolvedValue({ id: 42 });
    mockCreateReview.mockResolvedValue(1001);
    mockDetectQueryLanguageCode.mockResolvedValue("en-IN");
    mockLocalizeReview.mockResolvedValue({
      review: {
        verdict: "buy",
        pros: ["Good battery"],
        cons: ["Average speaker"],
        bestFor: "Budget buyers",
        summary: "Localized summary",
        tldr: "Localized TLDR text",
        confidenceScore: 0.78,
        sources: [
          { title: "R1", url: "https://example.com/1", type: "blog" },
          { title: "R2", url: "https://example.com/2", type: "youtube" },
        ],
      },
      languageCode: "en-IN",
      ttsLanguageCode: "en-IN",
      audioUrl: "https://blob.example/audio.wav",
      durationSeconds: 12.5,
    });
    mockGetLocalizedErrorMessage.mockImplementation(async (code: string) => `localized:${code}`);
    mockListTrending.mockResolvedValue([
      { brand: "Redmi", model: "Note 15" },
      { brand: "Samsung", model: "Galaxy S24" },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("emits understood and searching statuses for product intent", async () => {
    mockDetectQueryLanguageCode.mockResolvedValueOnce("te-IN");
    mockExtractIntentAndEntity.mockResolvedValueOnce({
      intent: "product_review",
      brand: "Redmi",
      model: "Note 15",
      variant: null,
      slug: "redmi-note-15",
      productName: "Redmi Note 15",
    });
    mockResolveCanonicalSlug.mockResolvedValueOnce("redmi-note-15");

    const request = new Request("http://localhost/api/query", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "1.1.1.1",
      },
      body: JSON.stringify({ text: "రెడ్‌మి నోట్ 15 ఎలా ఉంది?" }),
    }) as NextRequest;

    const response = await POST(request);
    const body = await response.text();
    const events = parseSSE(body);

    expect(events.map((event) => event.type)).toEqual([
      "status",
      "status",
      "status",
      "status",
      "review",
      "audio",
      "done",
    ]);
    expect(events[1].data).toMatchObject({
      status: "understood",
      context: { transcript: "రెడ్‌మి నోట్ 15 ఎలా ఉంది?", language: "te-IN" },
    });
    expect(events[2].data).toMatchObject({
      status: "searching",
      context: { product: "Redmi Note 15", productSlug: "redmi-note-15" },
    });
    expect(events[3].data).toMatchObject({
      status: "analyzing",
      context: { product: "Redmi Note 15", productSlug: "redmi-note-15", sourceCount: 2 },
    });
    expect(events[4].data).toMatchObject({
      verdict: "buy",
      confidenceScore: 0.78,
      bestFor: "Budget buyers",
      summary: "Localized summary",
    });
    expect(events[5].data).toMatchObject({
      audioUrl: "https://blob.example/audio.wav",
      durationSeconds: 12.5,
    });
    expect(mockUpsertProductBySlug).toHaveBeenCalledOnce();
    expect(mockCreateReview).toHaveBeenCalledOnce();
    expect(mockLocalizeReview).toHaveBeenCalledOnce();
  });

  it("emits NOT_A_PRODUCT error for unsupported intent", async () => {
    mockDetectQueryLanguageCode.mockResolvedValueOnce("en-IN");
    mockExtractIntentAndEntity.mockResolvedValueOnce({
      intent: "unsupported",
      brand: null,
      model: null,
      variant: null,
      slug: null,
      productName: null,
    });

    const request = new Request("http://localhost/api/query", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "2.2.2.2",
      },
      body: JSON.stringify({ text: "weather kya hai?" }),
    }) as NextRequest;

    const response = await POST(request);
    const body = await response.text();
    const events = parseSSE(body);

    expect(events.map((event) => event.type)).toEqual(["status", "status", "error", "done"]);
    expect(events[2].data).toMatchObject({
      code: "NOT_A_PRODUCT",
      message: "localized:NOT_A_PRODUCT",
    });
  });

  it("emits NO_REVIEWS when scraped sources are empty", async () => {
    mockDetectQueryLanguageCode.mockResolvedValueOnce("en-IN");
    mockExtractIntentAndEntity.mockResolvedValueOnce({
      intent: "product_review",
      brand: "Redmi",
      model: "Note 15",
      variant: null,
      slug: "redmi-note-15",
      productName: "Redmi Note 15",
    });
    mockResolveCanonicalSlug.mockResolvedValueOnce("redmi-note-15");
    mockScrapeAllSources.mockResolvedValueOnce([]);
    mockNormalizeSourcesToEnglish.mockResolvedValueOnce([]);

    const request = new Request("http://localhost/api/query", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "4.4.4.4",
      },
      body: JSON.stringify({ text: "Redmi Note 15 kaisa hai?" }),
    }) as NextRequest;

    const response = await POST(request);
    const body = await response.text();
    const events = parseSSE(body);

    expect(events.map((event) => event.type)).toEqual(["status", "status", "status", "error", "done"]);
    expect(events[3].data).toMatchObject({ code: "NO_REVIEWS" });
    expect(events[3].data.message).toBe("localized:NO_REVIEWS");
    expect(events[3].data.suggestions).toEqual(["Redmi Note 15", "Samsung Galaxy S24"]);
  });

  it("blocks synthesis in strict evidence mode when user-review evidence is low", async () => {
    mockDetectQueryLanguageCode.mockResolvedValueOnce("en-IN");
    vi.stubEnv("STRICT_REVIEW_EVIDENCE_MODE", "true");
    vi.stubEnv("STRICT_REVIEW_MIN_ECOMMERCE_SOURCES", "2");
    vi.stubEnv("STRICT_REVIEW_MIN_SIGNAL_HITS", "2");

    mockExtractIntentAndEntity.mockResolvedValueOnce({
      intent: "product_review",
      brand: "Redmi",
      model: "Note 15",
      variant: null,
      slug: "redmi-note-15",
      productName: "Redmi Note 15",
    });
    mockResolveCanonicalSlug.mockResolvedValueOnce("redmi-note-15");
    mockNormalizeSourcesToEnglish.mockResolvedValueOnce([
      {
        url: "https://example.com/blog-1",
        title: "R1",
        type: "blog",
        content: "editorial content",
        translatedToEnglish: false,
        originalLanguageCode: "en-IN",
      },
      {
        url: "https://example.com/blog-2",
        title: "R2",
        type: "youtube",
        content: "video transcript",
        translatedToEnglish: false,
        originalLanguageCode: "en-IN",
      },
    ]);

    const request = new Request("http://localhost/api/query", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "7.7.7.7",
      },
      body: JSON.stringify({ text: "Redmi Note 15 review" }),
    }) as NextRequest;

    const response = await POST(request);
    const body = await response.text();
    const events = parseSSE(body);

    expect(events.map((event) => event.type)).toEqual(["status", "status", "status", "error", "done"]);
    expect(events[3].data).toMatchObject({
      code: "INSUFFICIENT_USER_REVIEW_EVIDENCE",
      message: "localized:INSUFFICIENT_USER_REVIEW_EVIDENCE",
    });
    expect(mockSynthesizeReview).not.toHaveBeenCalled();
  });

  it("skips translation for en-IN path while still emitting audio", async () => {
    mockDetectQueryLanguageCode.mockResolvedValueOnce("en-IN");
    mockExtractIntentAndEntity.mockResolvedValueOnce({
      intent: "product_review",
      brand: "Apple",
      model: "iPhone 16",
      variant: null,
      slug: "iphone-16",
      productName: "iPhone 16",
    });
    mockResolveCanonicalSlug.mockResolvedValueOnce("iphone-16");

    const request = new Request("http://localhost/api/query", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "8.8.8.8",
      },
      body: JSON.stringify({ text: "iPhone 16 review" }),
    }) as NextRequest;

    const response = await POST(request);
    const body = await response.text();
    const events = parseSSE(body);

    expect(events.some((event) => event.type === "audio")).toBe(true);
    expect(mockLocalizeReview).toHaveBeenCalledWith(
      expect.objectContaining({
        languageCode: "en-IN",
      }),
    );
  });
});
