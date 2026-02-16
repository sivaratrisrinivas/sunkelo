type Verdict = "buy" | "skip" | "wait";

type ReviewSource = {
  title: string;
  url: string;
  type?: "blog" | "ecommerce" | "youtube";
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

const verdictStyles: Record<Verdict, string> = {
  buy: "bg-emerald-950 text-emerald-200 border-emerald-700/70",
  skip: "bg-red-950 text-red-200 border-red-700/70",
  wait: "bg-amber-950 text-amber-200 border-amber-700/70",
};

function verdictLabel(verdict: Verdict): string {
  if (verdict === "buy") return "Buy";
  if (verdict === "skip") return "Skip";
  return "Wait";
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function SkeletonLine({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} />;
}

export function ReviewCard({ data, loading = false }: ReviewCardProps) {
  if (loading) {
    return (
      <section
        role="status"
        aria-live="polite"
        className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4"
      >
        <SkeletonLine className="h-6 w-24" />
        <SkeletonLine className="h-3 w-48" />
        <SkeletonLine className="h-20 w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SkeletonLine className="h-24 w-full" />
          <SkeletonLine className="h-24 w-full" />
        </div>
        <SkeletonLine className="h-8 w-full" />
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const confidencePercent = clampPercent(data.confidenceScore);

  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${verdictStyles[data.verdict]}`}
        >
          {verdictLabel(data.verdict)}
        </span>
        <div className="min-w-40 flex-1">
          <p className="mb-1 text-xs text-zinc-400">Confidence</p>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${confidencePercent}%` }} />
          </div>
          <p className="mt-1 text-right text-xs text-zinc-400">{confidencePercent}%</p>
        </div>
      </div>

      <p className="text-sm text-zinc-200">{data.summary}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium text-emerald-300">Pros</p>
          <ul className="space-y-1 text-sm text-zinc-200">
            {data.pros.map((pro) => (
              <li key={pro} className="flex gap-2">
                <span aria-hidden>✓</span>
                <span>{pro}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-red-300">Cons</p>
          <ul className="space-y-1 text-sm text-zinc-200">
            {data.cons.map((con) => (
              <li key={con} className="flex gap-2">
                <span aria-hidden>x</span>
                <span>{con}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-sm text-zinc-300">
        <span className="font-medium text-zinc-100">Best for:</span> {data.bestFor}
      </p>

      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-zinc-400">Sources</p>
        {data.reviewEvidence ? (
          <p
            className={`text-xs ${
              data.reviewEvidence.hasUserReviewEvidence ? "text-emerald-300" : "text-amber-300"
            }`}
          >
            {data.reviewEvidence.hasUserReviewEvidence
              ? `User review evidence: ${data.reviewEvidence.reviewSignalCount}/${data.reviewEvidence.ecommerceSourceCount} ecommerce sources (${data.reviewEvidence.ecommerceDomains.join(", ")})`
              : "User review evidence: low (mostly editorial/video sources)"}
          </p>
        ) : null}
        <ul className="space-y-1">
          {data.sources.map((source) => (
            <li key={`${source.url}-${source.title}`}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-cyan-300 underline-offset-2 hover:underline"
              >
                {source.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
