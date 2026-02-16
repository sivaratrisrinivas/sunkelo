import { getFirecrawlClient, type FirecrawlClient } from "./client";
import { parseScrapedSource } from "./parsers";

export type ScrapedSourceType = "blog" | "ecommerce" | "youtube";

export type ScrapedReviewSource = {
  url: string;
  title: string;
  type: ScrapedSourceType;
  content: string;
};

type SearchTarget = {
  productName: string;
  query: string;
  type: ScrapedSourceType;
  limit: number;
};

const BLOG_SITES = "site:gsmarena.com OR site:91mobiles.com OR site:smartprix.com";
const ECOMMERCE_SITES = "site:amazon.in OR site:flipkart.com";
const YOUTUBE_SITE = "site:youtube.com";

function buildTargets(productName: string): Record<ScrapedSourceType, SearchTarget> {
  return {
    blog: {
      productName,
      type: "blog",
      limit: 3,
      query: `"${productName}" review India 2025 ${BLOG_SITES}`,
    },
    ecommerce: {
      productName,
      type: "ecommerce",
      limit: 3,
      query: `"${productName}" user reviews India ${ECOMMERCE_SITES}`,
    },
    youtube: {
      productName,
      type: "youtube",
      limit: 3,
      query: `"${productName}" review ${YOUTUBE_SITE}`,
    },
  };
}

async function searchAndScrapeTarget(
  target: SearchTarget,
  client: FirecrawlClient,
): Promise<ScrapedReviewSource[]> {
  const hits = await client.search(target.query, { limit: target.limit });
  if (!hits.length) {
    return [];
  }

  const scraped = await Promise.allSettled(
    hits.map(async (hit) => {
      const data = await client.scrape(hit.url, {
        formats: ["markdown"],
        onlyMainContent: true,
      });

      const source: ScrapedReviewSource = {
        url: data.url,
        title: data.title ?? hit.title ?? target.productName,
        type: target.type,
        content: data.markdown,
      };

      return parseScrapedSource(source);
    }),
  );

  return scraped
    .filter((item): item is PromiseFulfilledResult<ScrapedReviewSource> => item.status === "fulfilled")
    .map((item) => item.value);
}

export async function searchBlogs(
  productName: string,
  client: FirecrawlClient = getFirecrawlClient(),
): Promise<ScrapedReviewSource[]> {
  return searchAndScrapeTarget(buildTargets(productName).blog, client);
}

export async function searchEcommerce(
  productName: string,
  client: FirecrawlClient = getFirecrawlClient(),
): Promise<ScrapedReviewSource[]> {
  return searchAndScrapeTarget(buildTargets(productName).ecommerce, client);
}

export async function searchYouTube(
  productName: string,
  client: FirecrawlClient = getFirecrawlClient(),
): Promise<ScrapedReviewSource[]> {
  return searchAndScrapeTarget(buildTargets(productName).youtube, client);
}

export async function scrapeAllSources(
  productName: string,
  client: FirecrawlClient = getFirecrawlClient(),
): Promise<ScrapedReviewSource[]> {
  const settled = await Promise.allSettled([
    searchBlogs(productName, client),
    searchEcommerce(productName, client),
    searchYouTube(productName, client),
  ]);

  return settled
    .filter((item): item is PromiseFulfilledResult<ScrapedReviewSource[]> => item.status === "fulfilled")
    .flatMap((item) => item.value);
}
