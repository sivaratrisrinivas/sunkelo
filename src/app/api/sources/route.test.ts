import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockScrapeAllSources = vi.fn();
const mockNormalizeSourcesToEnglish = vi.fn();

vi.mock("@/lib/firecrawl/scraper", () => ({
  scrapeAllSources: (...args: unknown[]) => mockScrapeAllSources(...args),
}));

vi.mock("@/lib/pipeline/normalize-sources", () => ({
  normalizeSourcesToEnglish: (...args: unknown[]) => mockNormalizeSourcesToEnglish(...args),
}));

import { POST } from "./route";

describe("POST /api/sources", () => {
  it("returns scraped + normalized sources for product slug", async () => {
    mockScrapeAllSources.mockResolvedValueOnce([
      {
        url: "https://gsmarena.com/review-1",
        title: "Review 1",
        type: "blog",
        content: "यह फोन बहुत अच्छा है।",
      },
    ]);
    mockNormalizeSourcesToEnglish.mockResolvedValueOnce([
      {
        url: "https://gsmarena.com/review-1",
        title: "Review 1",
        type: "blog",
        content: "This phone is very good.",
        originalLanguageCode: "hi-IN",
        translatedToEnglish: true,
      },
    ]);

    const request = new Request("http://localhost/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productSlug: "redmi-note-15" }),
    }) as NextRequest;

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockScrapeAllSources).toHaveBeenCalledWith("Redmi Note 15");
    expect(payload.sourceCount).toBe(1);
    expect(payload.sources[0].content).toContain("This phone is very good.");
  });

  it("returns 400 for missing payload", async () => {
    const request = new Request("http://localhost/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }) as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
