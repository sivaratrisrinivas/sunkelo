import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// --- Mocks with realistic delays ---

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
const mockGetCachedReview = vi.fn();
const mockSetCachedReview = vi.fn();
const mockGetCachedLocalized = vi.fn();
const mockSetCachedLocalized = vi.fn();
const mockInsertLog = vi.fn();

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
vi.mock("@/lib/cache/reviews", () => ({
    getCachedReview: (...args: unknown[]) => mockGetCachedReview(...args),
    setCachedReview: (...args: unknown[]) => mockSetCachedReview(...args),
    getCachedLocalized: (...args: unknown[]) => mockGetCachedLocalized(...args),
    setCachedLocalized: (...args: unknown[]) => mockSetCachedLocalized(...args),
}));
vi.mock("@/lib/db/query-logs", () => ({
    insertLog: (...args: unknown[]) => mockInsertLog(...args),
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

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

type ParsedSSEEvent = {
    type: string;
    data: Record<string, unknown>;
};

function parseSSE(raw: string): ParsedSSEEvent[] {
    return raw
        .split("\n\n")
        .map((b) => b.trim())
        .filter(Boolean)
        .map((block) => {
            const lines = block.split("\n");
            const eventLine = lines.find((l) => l.startsWith("event: "));
            const dataLine = lines.find((l) => l.startsWith("data: "));
            return {
                type: eventLine?.replace("event: ", "") ?? "",
                data: JSON.parse(dataLine?.replace("data: ", "") ?? "{}"),
            };
        });
}

describe("latency budget", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 86400000 });
        mockGetCachedReview.mockResolvedValue(null);
        mockSetCachedReview.mockResolvedValue(undefined);
        mockGetCachedLocalized.mockResolvedValue(null);
        mockSetCachedLocalized.mockResolvedValue(undefined);
        mockInsertLog.mockResolvedValue(undefined);
        mockGetLocalizedErrorMessage.mockImplementation(async (code: string) => `localized:${code}`);
        mockListTrending.mockResolvedValue([]);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("full pipeline completes within 30s budget with realistic API delays", async () => {
        // STT: 2s
        mockDetectQueryLanguageCode.mockImplementation(() => delay(50).then(() => "en-IN"));
        // Entity extraction: ~500ms
        mockExtractIntentAndEntity.mockImplementation(() =>
            delay(500).then(() => ({
                intent: "product_review",
                brand: "Redmi",
                model: "Note 15",
                variant: null,
                slug: "redmi-note-15",
                productName: "Redmi Note 15",
            })),
        );
        mockResolveCanonicalSlug.mockImplementation(() => delay(100).then(() => "redmi-note-15"));
        // Scrape: 3s (most expensive)
        mockScrapeAllSources.mockImplementation(() =>
            delay(3000).then(() => [
                { url: "https://example.com/1", title: "R1", type: "blog", content: "review text" },
                { url: "https://example.com/2", title: "R2", type: "ecommerce", content: "user reviews" },
            ]),
        );
        // Normalize: 500ms
        mockNormalizeSourcesToEnglish.mockImplementation(() =>
            delay(500).then(() => [
                { url: "https://example.com/1", title: "R1", type: "blog", content: "normalized", translatedToEnglish: false, originalLanguageCode: "en-IN" },
                { url: "https://example.com/2", title: "R2", type: "ecommerce", content: "normalized 2", translatedToEnglish: false, originalLanguageCode: "en-IN" },
            ]),
        );
        // Synthesis: 2s
        mockSynthesizeReview.mockImplementation(() =>
            delay(2000).then(() => ({
                verdict: "buy",
                pros: ["Battery"],
                cons: ["Camera"],
                bestFor: "Budget buyers",
                summary: "A".repeat(180),
                tldr: "Budget phone with strong battery.",
                confidenceScore: 0.8,
                sources: [
                    { title: "R1", url: "https://example.com/1", type: "blog" },
                    { title: "R2", url: "https://example.com/2", type: "ecommerce" },
                ],
            })),
        );
        mockUpsertProductBySlug.mockResolvedValue({ id: 1 });
        mockCreateReview.mockResolvedValue(100);
        // Localize (translate + TTS): 2s
        mockLocalizeReview.mockImplementation(() =>
            delay(2000).then(() => ({
                review: {
                    verdict: "buy",
                    pros: ["Battery"],
                    cons: ["Camera"],
                    bestFor: "Budget buyers",
                    summary: "Localized",
                    tldr: "Localized TLDR",
                    confidenceScore: 0.8,
                    sources: [{ title: "R1", url: "https://example.com/1", type: "blog" }],
                },
                languageCode: "en-IN",
                ttsLanguageCode: "en-IN",
                audioUrl: "https://blob.example/audio.wav",
                durationSeconds: 12,
            })),
        );

        const startMs = Date.now();

        const request = new Request("http://localhost/api/query", {
            method: "POST",
            headers: { "content-type": "application/json", "x-forwarded-for": "1.1.1.1" },
            body: JSON.stringify({ text: "Redmi Note 15 review" }),
        }) as NextRequest;

        const response = await POST(request);
        const body = await response.text();
        const totalMs = Date.now() - startMs;
        const events = parseSSE(body);

        // Assert total pipeline < 30s
        expect(totalMs).toBeLessThan(30_000);

        // Assert pipeline completed successfully
        expect(events.some((e) => e.type === "review")).toBe(true);
        expect(events.some((e) => e.type === "done")).toBe(true);
    }, 30_000);

    it("first SSE event (listening) emitted within 3s", async () => {
        mockDetectQueryLanguageCode.mockResolvedValue("en-IN");
        mockExtractIntentAndEntity.mockImplementation(() =>
            delay(500).then(() => ({
                intent: "product_review",
                brand: "Redmi",
                model: "Note 15",
                variant: null,
                slug: "redmi-note-15",
                productName: "Redmi Note 15",
            })),
        );
        mockResolveCanonicalSlug.mockResolvedValue("redmi-note-15");
        mockScrapeAllSources.mockResolvedValue([
            { url: "https://example.com/1", title: "R1", type: "blog", content: "text" },
            { url: "https://example.com/2", title: "R2", type: "blog", content: "text2" },
        ]);
        mockNormalizeSourcesToEnglish.mockResolvedValue([
            { url: "https://example.com/1", title: "R1", type: "blog", content: "en", translatedToEnglish: false, originalLanguageCode: "en-IN" },
            { url: "https://example.com/2", title: "R2", type: "blog", content: "en2", translatedToEnglish: false, originalLanguageCode: "en-IN" },
        ]);
        mockSynthesizeReview.mockResolvedValue({
            verdict: "buy",
            pros: ["A"],
            cons: ["B"],
            bestFor: "C",
            summary: "A".repeat(180),
            tldr: "Quick TLDR for budget phone review.",
            confidenceScore: 0.7,
            sources: [{ title: "R1", url: "https://example.com/1", type: "blog" }],
        });
        mockUpsertProductBySlug.mockResolvedValue({ id: 1 });
        mockCreateReview.mockResolvedValue(100);
        mockLocalizeReview.mockResolvedValue({
            review: {
                verdict: "buy",
                pros: ["A"],
                cons: ["B"],
                bestFor: "C",
                summary: "Loc",
                tldr: "Loc TLDR",
                confidenceScore: 0.7,
                sources: [],
            },
            languageCode: "en-IN",
            ttsLanguageCode: "en-IN",
            audioUrl: null,
            durationSeconds: null,
        });

        const startMs = Date.now();

        const request = new Request("http://localhost/api/query", {
            method: "POST",
            headers: { "content-type": "application/json", "x-forwarded-for": "2.2.2.2" },
            body: JSON.stringify({ text: "Redmi Note 15" }),
        }) as NextRequest;

        const response = await POST(request);
        // Read just enough to get the first event
        const reader = response.body!.getReader();
        const { value } = await reader.read();
        const firstChunk = new TextDecoder().decode(value);
        const firstEventMs = Date.now() - startMs;
        reader.cancel();

        // First event should be within 3s
        expect(firstEventMs).toBeLessThan(3_000);
        expect(firstChunk).toContain("listening");
    });
});
