import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateChatCompletion = vi.fn();

vi.mock("@/lib/sarvam/chat", () => ({
  createChatCompletion: (...args: unknown[]) => mockCreateChatCompletion(...args),
  addChatUsage: (
    left: { promptTokens: number; cachedPromptTokens: number; completionTokens: number } | null,
    right: { promptTokens: number; cachedPromptTokens: number; completionTokens: number } | null,
  ) => {
    if (!left && !right) {
      return null;
    }
    return {
      promptTokens: (left?.promptTokens ?? 0) + (right?.promptTokens ?? 0),
      cachedPromptTokens: (left?.cachedPromptTokens ?? 0) + (right?.cachedPromptTokens ?? 0),
      completionTokens: (left?.completionTokens ?? 0) + (right?.completionTokens ?? 0),
    };
  },
  SARVAM_CHAT_MODEL: "sarvam-105b",
}));

import { synthesizeReview, synthesizedReviewSchema } from "./synthesize";

describe("synthesizedReviewSchema", () => {
  it("accepts valid synthesized review payload", () => {
    const parsed = synthesizedReviewSchema.parse({
      verdict: "buy",
      pros: ["Good battery", "Solid camera"],
      cons: ["Average low-light video"],
      bestFor: "Budget buyers",
      summary: "A".repeat(140),
      tldr: "A balanced phone with strong value and battery life for daily use.",
      confidenceScore: 0.82,
      sources: [{ title: "GSMArena review", url: "https://example.com/review", type: "blog" }],
    });

    expect(parsed.verdict).toBe("buy");
  });

  it("fails on invalid score and empty summary", () => {
    expect(() =>
      synthesizedReviewSchema.parse({
        verdict: "wait",
        pros: ["One pro"],
        cons: ["One con"],
        bestFor: "Test users",
        summary: "",
        tldr: "A".repeat(50),
        confidenceScore: 1.5,
        sources: [{ title: "Source", url: "https://example.com" }],
      }),
    ).toThrow();
  });
});

describe("synthesizeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds prompt and returns parsed structured output", async () => {
    mockCreateChatCompletion.mockResolvedValueOnce({
      content: JSON.stringify({
        verdict: "buy",
        pros: ["Excellent battery", "Bright display"],
        cons: ["Bloatware"],
        bestFor: "Users who want all-day battery",
        summary: "A".repeat(200),
        tldr: "A battery-first phone with very strong value for typical daily usage.",
        confidenceScore: 0.79,
        sources: [
          { title: "GSMArena", url: "https://example.com/a", type: "blog" },
          { title: "Flipkart", url: "https://example.com/b", type: "ecommerce" },
        ],
      }),
      usage: { promptTokens: 20, cachedPromptTokens: 0, completionTokens: 40 },
    });

    const result = await synthesizeReview({
      productName: "Redmi Note 15",
      sources: [
        {
          url: "https://example.com/a",
          title: "GSMArena",
          type: "blog",
          content: "review text",
          originalLanguageCode: "en-IN",
          translatedToEnglish: false,
        },
        {
          url: "https://example.com/b",
          title: "Flipkart",
          type: "ecommerce",
          content: "user sentiment",
          originalLanguageCode: "en-IN",
          translatedToEnglish: false,
        },
      ],
    });

    expect(result.verdict).toBe("buy");
    expect(result.pros).toHaveLength(2);
    expect(result.sarvamUsage).toEqual({
      promptTokens: 20,
      cachedPromptTokens: 0,
      completionTokens: 40,
    });
    expect(mockCreateChatCompletion).toHaveBeenCalledOnce();
    expect(mockCreateChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "sarvam-105b",
        reasoningEffort: null,
        maxTokens: 4096,
      }),
    );
  });

  it("falls back to text format when initial JSON is malformed", async () => {
    mockCreateChatCompletion
      .mockResolvedValueOnce({
        content: '{"verdict":"buy","pros":["Good"],"cons":["Bad",],"bestFor":"Test"}',
        usage: { promptTokens: 5, cachedPromptTokens: 0, completionTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: `VERDICT: buy
CONFIDENCE: 0.76
BEST_FOR: Power users
SUMMARY: ${"A".repeat(140)}
TLDR: Great performance and display, but pricing is premium for most users.
PROS:
- Excellent keyboard
CONS:
- Expensive
SOURCES:
- Source | https://example.com/1 | blog`,
        usage: { promptTokens: 6, cachedPromptTokens: 0, completionTokens: 8 },
      });

    const result = await synthesizeReview({
      productName: "Apple MacBook Pro",
      sources: [
        {
          url: "https://example.com/1",
          title: "Source",
          type: "blog",
          content: "content",
          originalLanguageCode: "en-IN",
          translatedToEnglish: false,
        },
      ],
    });

    expect(result.verdict).toBe("buy");
    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(2);
  });

  it("falls back to text format when JSON and repair are both malformed", async () => {
    mockCreateChatCompletion
      .mockResolvedValueOnce({ content: "{bad json", usage: null })
      .mockResolvedValueOnce({
        content: `VERDICT: buy
CONFIDENCE: 0.71
BEST_FOR: Developers and creators
SUMMARY: This laptop provides strong performance, efficient thermals, and a reliable display for professional workflows while still having trade-offs around price and upgrade flexibility.
TLDR: Great pro machine with high performance, but expensive.
PROS:
- Excellent performance
- Great battery life
CONS:
- Expensive
SOURCES:
- GSMArena | https://example.com/gsm | blog`,
        usage: { promptTokens: 8, cachedPromptTokens: 0, completionTokens: 12 },
      });

    const result = await synthesizeReview({
      productName: "Apple MacBook Pro",
      sources: [
        {
          url: "https://example.com/fallback",
          title: "Fallback Source",
          type: "blog",
          content: "review content",
          originalLanguageCode: "en-IN",
          translatedToEnglish: false,
        },
      ],
    });

    expect(result.verdict).toBe("buy");
    expect(result.pros.length).toBeGreaterThan(0);
    expect(result.sources[0].url).toBe("https://example.com/gsm");
    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(2);
  });
});
