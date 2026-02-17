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
const ECOMMERCE_REVIEW_URL_HINT =
  /(review|ratings|rating|product-reviews|customer-reviews|user-reviews|opinions|reviews)/i;

const TRUSTED_BLOG_DOMAINS = [
  "gsmarena.com",
  "91mobiles.com",
  "smartprix.com",
  "androidauthority.com",
  "techradar.com",
  "theverge.com",
  "cnet.com",
  "tomsguide.com",
  "notebookcheck.net",
] as const;

const TRUSTED_ECOMMERCE_DOMAINS = ["amazon.in", "flipkart.com"] as const;

const TRUSTED_YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"] as const;

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
      query: `"${productName}" user reviews ratings India ${ECOMMERCE_SITES}`,
    },
    youtube: {
      productName,
      type: "youtube",
      limit: 3,
      query: `"${productName}" review ${YOUTUBE_SITE}`,
    },
  };
}

function normalizeProductForSearch(productName: string): string {
  return productName
    .replace(/\b(v\d+(\.\d+)?|[0-9]+(\.[0-9]+)?\s*(ghz|mhz|hz|gb|tb|mp|mah|inch|in))\b/gi, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFallbackQueries(target: SearchTarget): string[] {
  const simplified = normalizeProductForSearch(target.productName) || target.productName;

  if (target.type === "ecommerce") {
    return [
      `"${simplified}" customer reviews ${ECOMMERCE_SITES}`,
      `${simplified} ratings ${ECOMMERCE_SITES}`,
      `${simplified} site:amazon.in OR site:flipkart.com`,
    ];
  }

  if (target.type === "blog") {
    return [`${simplified} review ${BLOG_SITES}`];
  }

  return [`${simplified} review ${YOUTUBE_SITE}`];
}

function dedupeHits<T extends { url: string }>(hits: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const hit of hits) {
    if (seen.has(hit.url)) continue;
    seen.add(hit.url);
    out.push(hit);
  }
  return out;
}

function hostFromUrl(input: string): string | null {
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hasTrustedDomain(hostname: string, trustedDomains: readonly string[]): boolean {
  return trustedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function isTrustedHit(
  hit: { url: string },
  type: ScrapedSourceType,
): boolean {
  const host = hostFromUrl(hit.url);
  if (!host) return false;

  if (type === "blog") {
    return hasTrustedDomain(host, TRUSTED_BLOG_DOMAINS);
  }
  if (type === "ecommerce") {
    return hasTrustedDomain(host, TRUSTED_ECOMMERCE_DOMAINS);
  }
  return hasTrustedDomain(host, TRUSTED_YOUTUBE_HOSTS);
}

function isReviewLikeHit(
  hit: { url: string; title?: string; description?: string },
  type: ScrapedSourceType,
): boolean {
  const text = `${hit.url} ${hit.title ?? ""} ${hit.description ?? ""}`.toLowerCase();

  if (type === "blog") {
    return /(review|pros|cons|verdict|hands-on|comparison)/.test(text);
  }
  if (type === "ecommerce") {
    return /(review|ratings|product-reviews|customer reviews)/.test(text);
  }
  if (type === "youtube") {
    return /(youtube\.com\/watch|youtu\.be)/.test(text) && /(review|vs|comparison|unboxing)/.test(text);
  }
  return true;
}

function isPreferredEcommerceDomain(url: string): boolean {
  return /(amazon\.in|flipkart\.com)/i.test(url);
}

async function searchAndScrapeTarget(
  target: SearchTarget,
  client: FirecrawlClient,
): Promise<ScrapedReviewSource[]> {
  const primaryHits = await client.search(target.query, { limit: target.limit });
  let hits = primaryHits;
  if (!hits.length) {
    const fallbackQueries = buildFallbackQueries(target);
    const fallbackResultSets = await Promise.allSettled(
      fallbackQueries.map((query) => client.search(query, { limit: target.limit })),
    );
    const fallbackHits = fallbackResultSets
      .filter(
        (result): result is PromiseFulfilledResult<Array<{ url: string; title?: string; description?: string }>> =>
          result.status === "fulfilled",
      )
      .flatMap((result) => result.value);
    hits = dedupeHits(fallbackHits);
  }

  const trustedHits = hits.filter((hit) => isTrustedHit(hit, target.type));

  if (!trustedHits.length) {
    return [];
  }

  let selectedHits = trustedHits;
  if (target.type === "ecommerce") {
    const preferred = trustedHits.filter((hit) => isPreferredEcommerceDomain(hit.url));
    const reviewPages = preferred.filter(
      (hit) =>
        ECOMMERCE_REVIEW_URL_HINT.test(hit.url) ||
        ECOMMERCE_REVIEW_URL_HINT.test(hit.title ?? "") ||
        ECOMMERCE_REVIEW_URL_HINT.test(hit.description ?? ""),
    );
    selectedHits = (reviewPages.length ? reviewPages : preferred.length ? preferred : trustedHits).slice(
      0,
      target.limit,
    );
  } else {
    const prioritizedHits = trustedHits.filter((hit) => isReviewLikeHit(hit, target.type));
    selectedHits = (prioritizedHits.length ? prioritizedHits : trustedHits).slice(0, target.limit);
  }

  const scraped = await Promise.allSettled(
    selectedHits.map(async (hit) => {
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

      if (!isTrustedHit({ url: source.url }, target.type)) {
        throw new Error(`Untrusted source domain skipped: ${source.url}`);
      }

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
