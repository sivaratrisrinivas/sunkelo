import { describe, expect, it } from "vitest";

import { getFirecrawlClient } from "./client";

const shouldRun = process.env.RUN_FIRECRAWL_CONTRACT_TESTS === "true";
const contract = shouldRun ? it : it.skip;

describe("firecrawl contract smoke test (optional)", () => {
  contract('search + scrape "iPhone 15 review" returns expected shape', async () => {
    const client = getFirecrawlClient();
    const results = await client.search("iPhone 15 review", { limit: 1 });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(typeof results[0].url).toBe("string");

    const scraped = await client.scrape(results[0].url);
    expect(typeof scraped.markdown).toBe("string");
    expect((scraped.markdown ?? "").length).toBeGreaterThan(0);
  });
});
