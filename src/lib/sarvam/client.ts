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

export type SarvamClient = {
  baseUrl: string;
  apiKey: string;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
};

let client: SarvamClient | null = null;

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
    },
  };

  return client;
}
