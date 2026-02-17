import { getFirecrawlClient, type FirecrawlClient } from "./client";
import { parseScrapedSource } from "./parsers";
import { z } from "zod";

export type ScrapedSourceType = "blog" | "ecommerce" | "youtube";

export type ScrapedReviewSource = {
  url: string;
  title: string;
  type: ScrapedSourceType;
  content: string;
  ecommerceOverview?: EcommerceOverview;
};

const SentimentLabelSchema = z.enum(["positive", "negative", "neutral", "mixed"]);

const EcommerceSentimentSchema = z.object({
  label: SentimentLabelSchema,
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).max(3).optional(),
});

const EcommerceReviewItemSchema = z.object({
  reviewerName: z.string().optional(),
  reviewDate: z.string().optional(),
  starRating: z.number().optional(),
  title: z.string().optional(),
  reviewText: z.string().optional(),
  sentiment: EcommerceSentimentSchema.optional(),
});

const EcommerceJsonSchema = z.object({
  site: z.enum(["amazon", "flipkart", "myntra", "ajio", "unknown"]).optional(),
  url: z.string().url().optional(),
  productTitle: z.string().optional(),
  price: z.string().optional(),
  currency: z.string().optional(),
  overallRating: z.number().optional(),
  ratingsCount: z.number().optional(),
  reviewsCount: z.number().optional(),
  reviews: z.array(EcommerceReviewItemSchema).optional(),
});

export type EcommerceOverview = {
  site: "amazon" | "flipkart" | "myntra" | "ajio" | "unknown";
  productTitle?: string;
  price?: string;
  currency?: string;
  overallRating?: number;
  ratingsCount?: number;
  reviewsCount?: number;
  reviewSampleCount: number;
  averageReviewRating?: number;
  sentimentBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
    mixed: number;
  };
};

const ECOMMERCE_JSON_PROMPT = `
Extract product + user review signals from this ecommerce product page.

Return JSON that matches the schema exactly.

Rules:
- Infer site from domain (amazon/flipkart/myntra/ajio/unknown).
- Extract productTitle, price, currency, overallRating, ratingsCount, reviewsCount when visible.
- Extract up to 25 visible reviews.
- For each review: reviewerName, reviewDate, starRating, title, reviewText.
- Add sentiment per review (positive/negative/neutral/mixed with score/confidence and up to 3 short reasons).
- Do not invent values; omit unknown fields.
`.trim();

type SearchTarget = {
  productName: string;
  query: string;
  type: ScrapedSourceType;
  limit: number;
};

const BLOG_SITES = "site:gsmarena.com OR site:91mobiles.com OR site:smartprix.com OR site:androidauthority.com OR site:techradar.com OR site:theverge.com OR site:cnet.com OR site:tomsguide.com OR site:notebookcheck.net OR site:gadgets360.com OR site:digit.in OR site:thewirecutter.com OR site:goodreads.com";
const ECOMMERCE_SITES = "site:amazon.in OR site:flipkart.com OR site:myntra.com OR site:ajio.com";
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
  "gadgets360.com",
  "digit.in",
  "thewirecutter.com",
  "goodreads.com",
] as const;

const TRUSTED_ECOMMERCE_DOMAINS = ["amazon.in", "flipkart.com", "myntra.com", "ajio.com"] as const;

const TRUSTED_YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"] as const;

function buildTargets(productName: string): Record<ScrapedSourceType, SearchTarget> {
  return {
    blog: {
      productName,
      type: "blog",
      limit: 5,
      query: `"${productName}" review ${BLOG_SITES}`,
    },
    ecommerce: {
      productName,
      type: "ecommerce",
      limit: 4,
      query: `"${productName}" reviews ratings ${ECOMMERCE_SITES}`,
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
      `${simplified} site:amazon.in OR site:flipkart.com OR site:myntra.com OR site:ajio.com`,
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
  return /(amazon\.in|flipkart\.com|myntra\.com|ajio\.com)/i.test(url);
}

function detectSite(url: string): EcommerceOverview["site"] {
  const host = hostFromUrl(url) ?? "";
  if (host.includes("amazon.")) return "amazon";
  if (host.includes("flipkart.com")) return "flipkart";
  if (host.includes("myntra.com")) return "myntra";
  if (host.includes("ajio.com")) return "ajio";
  return "unknown";
}

function buildFallbackOverview(url: string): EcommerceOverview {
  return {
    site: detectSite(url),
    reviewSampleCount: 0,
    sentimentBreakdown: {
      positive: 0,
      negative: 0,
      neutral: 0,
      mixed: 0,
    },
  };
}

function parseEcommercePayload(url: string, payload: unknown): {
  content: string;
  overview: EcommerceOverview;
} | null {
  const parsed = EcommerceJsonSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  const reviews = (parsed.data.reviews ?? [])
    .map((review) => {
      const title = review.title?.trim();
      const text = review.reviewText?.trim();
      const rating = typeof review.starRating === "number" ? `${review.starRating}/5` : null;
      const sentiment = review.sentiment?.label ? `sentiment:${review.sentiment.label}` : null;
      const packed = [title, text, rating, sentiment].filter(Boolean).join(" | ");
      return packed.trim();
    })
    .filter(Boolean);

  const sentimentBreakdown = {
    positive: 0,
    negative: 0,
    neutral: 0,
    mixed: 0,
  };
  let ratingsSum = 0;
  let ratingsCount = 0;
  for (const review of parsed.data.reviews ?? []) {
    if (review.sentiment?.label) {
      sentimentBreakdown[review.sentiment.label] += 1;
    }
    if (typeof review.starRating === "number") {
      ratingsSum += review.starRating;
      ratingsCount += 1;
    }
  }

  const overview: EcommerceOverview = {
    site: parsed.data.site ?? detectSite(url),
    productTitle: parsed.data.productTitle,
    price: parsed.data.price,
    currency: parsed.data.currency,
    overallRating: parsed.data.overallRating,
    ratingsCount: parsed.data.ratingsCount,
    reviewsCount: parsed.data.reviewsCount,
    reviewSampleCount: reviews.length,
    averageReviewRating: ratingsCount ? Number((ratingsSum / ratingsCount).toFixed(2)) : undefined,
    sentimentBreakdown,
  };

  return {
    content: reviews.join(". "),
    overview,
  };
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
      let data = null as Awaited<ReturnType<FirecrawlClient["scrape"]>> | null;
      let overview: EcommerceOverview | undefined;

      if (target.type === "ecommerce") {
        data = await client.scrape(hit.url, {
          formats: [
            {
              type: "json",
              schema: z.toJSONSchema(EcommerceJsonSchema) as Record<string, unknown>,
              prompt: ECOMMERCE_JSON_PROMPT,
            },
          ],
          onlyMainContent: false,
          waitFor: 2000,
          timeout: 120000,
        });

        const parsedJson = parseEcommercePayload(hit.url, data.json);
        if (parsedJson) {
          overview = parsedJson.overview;
          data = {
            ...data,
            markdown: parsedJson.content || data.markdown || "",
          };
        } else if (!data.markdown) {
          data = await client.scrape(hit.url, {
            formats: ["markdown"],
            onlyMainContent: true,
          });
          overview = buildFallbackOverview(hit.url);
        }
      } else {
        data = await client.scrape(hit.url, {
          formats: ["markdown"],
          onlyMainContent: true,
        });
      }

      const source: ScrapedReviewSource = {
        url: data.url,
        title: data.title ?? hit.title ?? target.productName,
        type: target.type,
        content: data.markdown ?? "",
        ecommerceOverview: overview,
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
