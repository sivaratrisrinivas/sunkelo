export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class SarvamError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SarvamError";
    this.status = status;
  }
}

const DEFAULT_BASE_URL = "https://api.sarvam.ai";
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 2_000;
const MAX_RETRIES = 1;

export type SarvamClient = {
  baseUrl: string;
  apiKey: string;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
};

let client: SarvamClient | null = null;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function singleRequest<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if ([500, 503].includes(response.status)) {
      throw new SarvamError("Sarvam service unavailable", response.status);
    }

    if (!response.ok) {
      throw new SarvamError(`Sarvam request failed with ${response.status}`, response.status);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function getSarvamClient(): SarvamClient {
  if (client) {
    return client;
  }

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new ConfigError("SARVAM_API_KEY is not set");
  }

  const baseUrl = process.env.SARVAM_BASE_URL ?? DEFAULT_BASE_URL;

  client = {
    baseUrl,
    apiKey,
    async request<T>(path: string, init?: RequestInit): Promise<T> {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          return await singleRequest<T>(baseUrl, apiKey, path, init);
        } catch (error) {
          const isRetryable =
            error instanceof SarvamError && [500, 503].includes(error.status);
          if (!isRetryable || attempt >= MAX_RETRIES) {
            throw error;
          }
          console.warn("[sarvam] retrying after 500/503", {
            path,
            attempt: attempt + 1,
            delayMs: RETRY_DELAY_MS,
          });
          await sleep(RETRY_DELAY_MS);
        }
      }
      // Unreachable, but TypeScript needs it
      throw new SarvamError("Sarvam request failed after retries", 503);
    },
  };

  return client;
}
