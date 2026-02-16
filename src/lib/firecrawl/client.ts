export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class FirecrawlError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FirecrawlError";
    this.status = status;
  }
}

const DEFAULT_BASE_URL = "https://api.firecrawl.dev";
const DEFAULT_TIMEOUT_MS = 30_000;

export type FirecrawlSearchResult = {
  url: string;
  title?: string;
};

export type FirecrawlSearchOptions = {
  limit?: number;
  scrapeOptions?: {
    formats?: string[];
    onlyMainContent?: boolean;
  };
};

export type FirecrawlScrapeOptions = {
  formats?: string[];
  onlyMainContent?: boolean;
};

export type FirecrawlScrapeResult = {
  url: string;
  markdown: string;
  title?: string;
};

export type FirecrawlClient = {
  baseUrl: string;
  apiKey: string;
  search: (query: string, options?: FirecrawlSearchOptions) => Promise<FirecrawlSearchResult[]>;
  scrape: (url: string, options?: FirecrawlScrapeOptions) => Promise<FirecrawlScrapeResult>;
};

let client: FirecrawlClient | null = null;

type FirecrawlSearchResponse = {
  data?:
    | Array<{
        url?: string;
        title?: string;
      }>
    | {
        web?: Array<{
          url?: string;
          title?: string;
        }>;
      };
};

type FirecrawlScrapeResponse = {
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
    };
  };
};

async function requestJson<T>({
  baseUrl,
  apiKey,
  path,
  body,
}: {
  baseUrl: string;
  apiKey: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new FirecrawlError(`Firecrawl request failed with ${response.status}`, response.status);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function getFirecrawlClient(): FirecrawlClient {
  if (client) {
    return client;
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new ConfigError("FIRECRAWL_API_KEY is not set");
  }

  const baseUrl = process.env.FIRECRAWL_BASE_URL ?? DEFAULT_BASE_URL;

  client = {
    baseUrl,
    apiKey,
    async search(query, options = {}) {
      const payload = await requestJson<FirecrawlSearchResponse>({
        baseUrl,
        apiKey,
        path: "/v2/search",
        body: {
          query,
          limit: options.limit ?? 3,
          sources: ["web"],
          scrapeOptions: options.scrapeOptions,
        },
      });

      const results = Array.isArray(payload.data) ? payload.data : (payload.data?.web ?? []);
      return results
        .filter((item): item is { url: string; title?: string } => typeof item.url === "string")
        .map((item) => ({
          url: item.url,
          title: item.title,
        }));
    },
    async scrape(url, options = {}) {
      const payload = await requestJson<FirecrawlScrapeResponse>({
        baseUrl,
        apiKey,
        path: "/v2/scrape",
        body: {
          url,
          formats: options.formats ?? ["markdown"],
          onlyMainContent: options.onlyMainContent ?? true,
        },
      });

      const markdown = payload.data?.markdown?.trim();
      if (!markdown) {
        throw new FirecrawlError(`No markdown returned for ${url}`, 502);
      }

      return {
        url,
        markdown,
        title: payload.data?.metadata?.title,
      };
    },
  };

  return client;
}
