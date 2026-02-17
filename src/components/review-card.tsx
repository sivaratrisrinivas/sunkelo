type Verdict = "buy" | "skip" | "wait";

type ReviewSource = {
  title: string;
  url: string;
  type?: "blog" | "ecommerce" | "youtube";
  site?: "amazon" | "flipkart" | "myntra" | "ajio" | "unknown";
  productTitle?: string;
  price?: string;
  currency?: string;
  overallRating?: number;
  ratingsCount?: number;
  reviewsCount?: number;
  reviewSampleCount?: number;
  averageReviewRating?: number;
  sentimentBreakdown?: {
    positive: number;
    negative: number;
    neutral: number;
    mixed: number;
  };
};

export type ReviewCardData = {
  verdict: Verdict;
  confidenceScore: number;
  pros: string[];
  cons: string[];
  bestFor: string;
  summary: string;
  tldr?: string;
  sources: ReviewSource[];
  reviewEvidence?: {
    totalSources: number;
    ecommerceSourceCount: number;
    ecommerceDomains: string[];
    reviewSignalCount: number;
    hasUserReviewEvidence: boolean;
  };
};

type ReviewCardProps = {
  data?: ReviewCardData;
  loading?: boolean;
};

const verdictColor: Record<Verdict, string> = {
  buy: "text-[var(--color-buy)]",
  skip: "text-[var(--color-skip)]",
  wait: "text-[var(--color-wait)]",
};

const verdictDot: Record<Verdict, string> = {
  buy: "bg-[var(--color-buy)]",
  skip: "bg-[var(--color-skip)]",
  wait: "bg-[var(--color-wait)]",
};

function verdictLabel(verdict: Verdict): string {
  if (verdict === "buy") return "Recommended";
  if (verdict === "skip") return "Skip This";
  return "Wait for Sale";
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function SkeletonLine({ className }: { className: string }) {
  return <div className={`shimmer rounded-lg bg-[var(--fg-faint)]/10 ${className}`} />;
}

export function ReviewCard({ data, loading = false }: ReviewCardProps) {
  if (loading) {
    return (
      <section role="status" aria-live="polite" className="rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-surface)] p-6 sm:p-8">
        <div className="flex justify-between items-center mb-8">
          <SkeletonLine className="h-8 w-32" />
          <SkeletonLine className="h-4 w-20" />
        </div>
        <SkeletonLine className="h-20 w-full rounded-xl mb-6" />
        <div className="grid grid-cols-2 gap-6 mb-6">
          <SkeletonLine className="h-28 w-full rounded-xl" />
          <SkeletonLine className="h-28 w-full rounded-xl" />
        </div>
        <SkeletonLine className="h-10 w-full rounded-lg" />
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const confidencePercent = clampPercent(data.confidenceScore);
  const ecommerceSources = data.sources.filter((source) => source.type === "ecommerce");
  const ecommerceOverview = ecommerceSources[0];
  const aggregatedSentiment = ecommerceSources.reduce(
    (acc, source) => {
      if (source.sentimentBreakdown) {
        acc.positive += source.sentimentBreakdown.positive;
        acc.negative += source.sentimentBreakdown.negative;
        acc.neutral += source.sentimentBreakdown.neutral;
        acc.mixed += source.sentimentBreakdown.mixed;
      }
      return acc;
    },
    { positive: 0, negative: 0, neutral: 0, mixed: 0 },
  );
  const hasSentiment =
    aggregatedSentiment.positive +
    aggregatedSentiment.negative +
    aggregatedSentiment.neutral +
    aggregatedSentiment.mixed >
    0;

  return (
    <section className="rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-surface)] p-6 sm:p-8 transition-all duration-300">
      {/* Verdict + Confidence */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${verdictDot[data.verdict]}`} />
          <span className={`text-lg font-bold tracking-tight ${verdictColor[data.verdict]}`}>
            {verdictLabel(data.verdict)}
          </span>
        </div>
        <span className="text-xs text-[var(--fg-faint)]">{confidencePercent}% confidence</span>
      </div>

      {/* Summary */}
      <p className="mb-8 text-base leading-relaxed text-[var(--fg)] sm:text-lg">
        {data.summary}
      </p>

      {/* Pros & Cons */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-buy)]">
            Pros
          </h3>
          <ul className="space-y-2">
            {data.pros.map((pro) => (
              <li key={pro} className="flex gap-2 text-sm text-[var(--fg-muted)]">
                <span className="text-[var(--color-buy)] shrink-0">+</span>
                {pro}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-skip)]">
            Cons
          </h3>
          <ul className="space-y-2">
            {data.cons.map((con) => (
              <li key={con} className="flex gap-2 text-sm text-[var(--fg-muted)]">
                <span className="text-[var(--color-skip)] shrink-0">−</span>
                {con}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Best for */}
      <div className="mb-8 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] px-5 py-3">
        <p className="text-sm text-[var(--fg-muted)]">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--fg-faint)] mr-2">
            Best for
          </span>
          {data.bestFor}
        </p>
      </div>

      {/* Ecommerce overview */}
      {ecommerceOverview ? (
        <div className="mb-8 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--fg-faint)]">User Review Snapshot</p>
            <p className="text-[10px] text-[var(--fg-faint)]">
              {(ecommerceOverview.site ?? "unknown").toUpperCase()}
              {typeof ecommerceOverview.overallRating === "number"
                ? ` · ${ecommerceOverview.overallRating}/5`
                : ""}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-1.5 text-sm text-[var(--fg-muted)] sm:grid-cols-2">
            <p>
              <span className="text-[var(--fg)]">Product:</span>{" "}
              {ecommerceOverview.productTitle ?? "Not captured"}
            </p>
            <p>
              <span className="text-[var(--fg)]">Price:</span>{" "}
              {ecommerceOverview.price
                ? `${ecommerceOverview.price}${ecommerceOverview.currency ? ` (${ecommerceOverview.currency})` : ""}`
                : "Not captured"}
            </p>
            <p>
              <span className="text-[var(--fg)]">Ratings:</span>{" "}
              {typeof ecommerceOverview.ratingsCount === "number"
                ? ecommerceOverview.ratingsCount.toLocaleString()
                : "Not captured"}
            </p>
            <p>
              <span className="text-[var(--fg)]">Reviews:</span>{" "}
              {typeof ecommerceOverview.reviewsCount === "number"
                ? ecommerceOverview.reviewsCount.toLocaleString()
                : ecommerceOverview.reviewSampleCount ?? "Not captured"}
            </p>
            <p>
              <span className="text-[var(--fg)]">Sampled Reviews:</span>{" "}
              {ecommerceOverview.reviewSampleCount ?? 0}
            </p>
            <p>
              <span className="text-[var(--fg)]">Avg Sample Rating:</span>{" "}
              {typeof ecommerceOverview.averageReviewRating === "number"
                ? `${ecommerceOverview.averageReviewRating}/5`
                : "Not captured"}
            </p>
          </div>
          {hasSentiment ? (
            <p className="mt-3 text-[10px] text-[var(--fg-faint)]">
              Sentiment mix: +{aggregatedSentiment.positive} / -{aggregatedSentiment.negative} / neutral{" "}
              {aggregatedSentiment.neutral} / mixed {aggregatedSentiment.mixed}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Sources */}
      <div className="space-y-3 border-t border-[var(--glass-border)] pt-6">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--fg-faint)]">Sources</p>
          {data.reviewEvidence ? (
            <span
              className={`text-[10px] tracking-wide ${data.reviewEvidence.hasUserReviewEvidence ? "text-[var(--color-buy)]" : "text-[var(--color-wait)]"
                }`}
            >
              {data.reviewEvidence.hasUserReviewEvidence
                ? "✓ Verified User Reviews"
                : "Editorial Sources"}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {data.sources.map((source) => (
            <a
              key={`${source.url}-${source.title}`}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--fg-faint)] transition-colors hover:text-[var(--accent)]"
            >
              {source.title}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
