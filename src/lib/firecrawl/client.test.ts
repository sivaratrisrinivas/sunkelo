import { beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

describe("getFirecrawlClient", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      FIRECRAWL_API_KEY: "fc-test-key",
      FIRECRAWL_BASE_URL: "https://api.firecrawl.dev",
    };
  });

  it("instantiates with API key and performs search/scrape", async () => {
    const { getFirecrawlClient } = await import("./client");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ url: "https://example.com/review", title: "Example Review" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { markdown: "Great phone.", metadata: { title: "Example Review" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const client = getFirecrawlClient();
    const search = await client.search("iphone review", { limit: 1 });
    const scrape = await client.scrape("https://example.com/review");

    expect(client.apiKey).toBe("fc-test-key");
    expect(search).toHaveLength(1);
    expect(search[0].url).toBe("https://example.com/review");
    expect(scrape.markdown).toBe("Great phone.");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws ConfigError when FIRECRAWL_API_KEY is missing", async () => {
    process.env = { ...originalEnv };
    delete process.env.FIRECRAWL_API_KEY;
    const { getFirecrawlClient, ConfigError } = await import("./client");

    expect(() => getFirecrawlClient()).toThrow(ConfigError);
  });
});
