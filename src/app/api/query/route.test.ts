import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockCheckRateLimit = vi.fn();
const mockTranscribeAudio = vi.fn();
const mockExtractIntentAndEntity = vi.fn();
const mockResolveCanonicalSlug = vi.fn();
const mockScrapeAllSources = vi.fn();
const mockNormalizeSourcesToEnglish = vi.fn();
const mockSynthesizeReview = vi.fn();
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
    mockListTrending.mockResolvedValue([
      { brand: "Redmi", model: "Note 15" },
      { brand: "Samsung", model: "Galaxy S24" },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("emits understood and searching statuses for product intent", async () => {
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
      body: JSON.stringify({ text: "Redmi Note 15 kaisa hai?" }),
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
      "done",
    ]);
    expect(events[1].data).toMatchObject({
      status: "understood",
      context: { transcript: "Redmi Note 15 kaisa hai?", language: "en-IN" },
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
    });
    expect(mockUpsertProductBySlug).toHaveBeenCalledOnce();
    expect(mockCreateReview).toHaveBeenCalledOnce();
  });

  it("emits NOT_A_PRODUCT error for unsupported intent", async () => {
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
    });
  });

  it("emits NO_REVIEWS when scraped sources are empty", async () => {
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
    expect(events[3].data.suggestions).toEqual(["Redmi Note 15", "Samsung Galaxy S24"]);
  });

  it("blocks synthesis in strict evidence mode when user-review evidence is low", async () => {
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
    });
    expect(mockSynthesizeReview).not.toHaveBeenCalled();
  });
});
