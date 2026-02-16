type SourceLike = {
  url: string;
  type?: string;
  content?: string;
};

export type ReviewEvidence = {
  totalSources: number;
  ecommerceSourceCount: number;
  ecommerceDomains: string[];
  reviewSignalCount: number;
  hasUserReviewEvidence: boolean;
};

export type StrictEvidencePolicy = {
  enabled: boolean;
  minEcommerceSources: number;
  minReviewSignals: number;
};

const USER_REVIEW_DOMAINS = ["amazon.in", "flipkart.com", "myntra.com", "ajio.com"] as const;
const USER_REVIEW_SIGNAL =
  /(customer review|customer reviews|verified purchase|ratings|rating|value for money|fit|size|delivery|quality|refund|return)/i;

function getHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  return value.trim().toLowerCase() === "true";
}

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export function getStrictEvidencePolicy(): StrictEvidencePolicy {
  return {
    enabled: parseBooleanEnv(process.env.STRICT_REVIEW_EVIDENCE_MODE),
    minEcommerceSources: parsePositiveIntEnv(process.env.STRICT_REVIEW_MIN_ECOMMERCE_SOURCES, 2),
    minReviewSignals: parsePositiveIntEnv(process.env.STRICT_REVIEW_MIN_SIGNAL_HITS, 2),
  };
}

export function collectReviewEvidence(sources: SourceLike[]): ReviewEvidence {
  const ecommerceSources = sources.filter((source) => source.type === "ecommerce");
  const ecommerceDomains = Array.from(
    new Set(
      ecommerceSources
        .map((source) => getHost(source.url))
        .filter((host): host is string => Boolean(host))
        .filter((host) => USER_REVIEW_DOMAINS.some((domain) => host.includes(domain))),
    ),
  );
  const reviewSignalCount = ecommerceSources.filter((source) =>
    USER_REVIEW_SIGNAL.test(source.content ?? ""),
  ).length;

  return {
    totalSources: sources.length,
    ecommerceSourceCount: ecommerceSources.length,
    ecommerceDomains,
    reviewSignalCount,
    hasUserReviewEvidence: ecommerceDomains.length > 0 && reviewSignalCount > 0,
  };
}

export function hasEnoughUserReviewEvidence(
  evidence: ReviewEvidence,
  policy: StrictEvidencePolicy,
): boolean {
  if (!policy.enabled) {
    return true;
  }

  return (
    evidence.ecommerceSourceCount >= policy.minEcommerceSources &&
    evidence.reviewSignalCount >= policy.minReviewSignals
  );
}
