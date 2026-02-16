import { describe, expect, it, vi } from "vitest";

import {
  scrapeAllSources,
  searchBlogs,
  searchEcommerce,
  searchYouTube,
  type ScrapedReviewSource,
} from "./scraper";

function createMockClient() {
  return {
    search: vi.fn(),
    scrape: vi.fn(),
    baseUrl: "https://api.firecrawl.dev",
    apiKey: "test-key",
  };
}

describe("firecrawl scraper helpers", () => {
  it("searchBlogs fetches and scrapes top 3 results", async () => {
    const client = createMockClient();
    client.search.mockResolvedValueOnce([
      { url: "https://gsmarena.com/r1", title: "R1" },
      { url: "https://91mobiles.com/r2", title: "R2" },
      { url: "https://smartprix.com/r3", title: "R3" },
    ]);
    client.scrape
      .mockResolvedValueOnce({ url: "https://gsmarena.com/r1", markdown: "blog one.", title: "R1" })
      .mockResolvedValueOnce({ url: "https://91mobiles.com/r2", markdown: "blog two.", title: "R2" })
      .mockResolvedValueOnce({ url: "https://smartprix.com/r3", markdown: "blog three.", title: "R3" });

    const result = await searchBlogs("iPhone 15", client);

    expect(result).toHaveLength(3);
    expect(result.every((item) => item.type === "blog")).toBe(true);
    expect(client.search).toHaveBeenCalledOnce();
    expect(client.scrape).toHaveBeenCalledTimes(3);
  });

  it("searchEcommerce handles zero results gracefully", async () => {
    const client = createMockClient();
    client.search.mockResolvedValueOnce([]);

    const result = await searchEcommerce("Unknown Phone", client);
    expect(result).toEqual([]);
    expect(client.scrape).not.toHaveBeenCalled();
  });

  it("searchYouTube returns transcript-like content", async () => {
    const client = createMockClient();
    client.search.mockResolvedValueOnce([{ url: "https://youtube.com/watch?v=1", title: "Video 1" }]);
    client.scrape.mockResolvedValueOnce({
      url: "https://youtube.com/watch?v=1",
      markdown: "This is transcript text from YouTube review.",
      title: "Video 1",
    });

    const result = await searchYouTube("Pixel 9", client);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("youtube");
    expect(result[0].content).toContain("transcript");
  });
});

describe("scrapeAllSources", () => {
  it("runs all source types and merges results", async () => {
    const client = createMockClient();
    client.search
      .mockResolvedValueOnce([{ url: "https://gsmarena.com/r1", title: "Blog" }])
      .mockResolvedValueOnce([{ url: "https://amazon.in/r1", title: "Ecom" }])
      .mockResolvedValueOnce([{ url: "https://youtube.com/watch?v=1", title: "YT" }]);
    client.scrape
      .mockResolvedValueOnce({ url: "https://gsmarena.com/r1", markdown: "blog", title: "Blog" })
      .mockResolvedValueOnce({ url: "https://amazon.in/r1", markdown: "ecom", title: "Ecom" })
      .mockResolvedValueOnce({ url: "https://youtube.com/watch?v=1", markdown: "yt", title: "YT" });

    const result = await scrapeAllSources("Redmi Note 15", client);
    expect(result).toHaveLength(3);
    expect(result.map((item) => item.type).sort()).toEqual(["blog", "ecommerce", "youtube"]);
  });

  it("returns remaining sources when one search path fails", async () => {
    const client = createMockClient();
    client.search
      .mockResolvedValueOnce([{ url: "https://gsmarena.com/r1", title: "Blog" }])
      .mockRejectedValueOnce(new Error("flipkart down"))
      .mockResolvedValueOnce([{ url: "https://youtube.com/watch?v=1", title: "YT" }]);
    client.scrape
      .mockResolvedValueOnce({ url: "https://gsmarena.com/r1", markdown: "blog", title: "Blog" })
      .mockResolvedValueOnce({ url: "https://youtube.com/watch?v=1", markdown: "yt", title: "YT" });

    const result = await scrapeAllSources("Galaxy S24", client);

    const asTypes = (sources: ScrapedReviewSource[]) => sources.map((item) => item.type).sort();
    expect(asTypes(result)).toEqual(["blog", "youtube"]);
  });

  it("returns empty array when all sources fail", async () => {
    const client = createMockClient();
    client.search
      .mockRejectedValueOnce(new Error("blog fail"))
      .mockRejectedValueOnce(new Error("ecom fail"))
      .mockRejectedValueOnce(new Error("yt fail"));

    const result = await scrapeAllSources("Nothing Phone", client);
    expect(result).toEqual([]);
  });
});
