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
  buy: "bg-[#00a680]/10 text-[#00a680] border-[#00a680]/20",
  skip: "bg-[#ff5a5f]/10 text-[#ff5a5f] border-[#ff5a5f]/20",
  wait: "bg-[#ffb400]/10 text-[#ffb400] border-[#ffb400]/20",
};

const verdictGlow: Record<Verdict, string> = {
  buy: "from-green-50 to-transparent",
  skip: "from-red-50 to-transparent",
  wait: "from-yellow-50 to-transparent",
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
  return <div className={`shimmer rounded-lg ${className}`} />;
}

export function ReviewCard({ data, loading = false }: ReviewCardProps) {
  if (loading) {
    return (
      <section role="status" aria-live="polite" className="glass rounded-3xl p-8 shadow-lg">
        <div className="flex justify-between items-start mb-8">
          <SkeletonLine className="h-10 w-36 rounded-full" />
          <SkeletonLine className="h-10 w-24 rounded-lg" />
        </div>
        <SkeletonLine className="h-28 w-full rounded-2xl mb-8" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-8">
          <SkeletonLine className="h-40 w-full rounded-2xl" />
          <SkeletonLine className="h-40 w-full rounded-2xl" />
        </div>
        <SkeletonLine className="h-14 w-full rounded-xl" />
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const confidencePercent = clampPercent(data.confidenceScore);

  return (
    <section className="glass overflow-hidden rounded-3xl p-6 sm:p-8 shadow-lg transition-all duration-300 hover:shadow-xl">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${verdictGlow[data.verdict]} opacity-30 pointer-events-none`}
      />

      <div className="relative mb-8 flex flex-wrap items-center justify-between gap-4">
        <span
          className={`inline-flex items-center rounded-full border px-5 py-2 text-sm font-semibold ${verdictStyles[data.verdict]}`}
        >
          {verdictLabel(data.verdict)}
        </span>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-400">Confidence</span>
          <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#00a680] to-[#00d68f] transition-all duration-1000"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-500">{confidencePercent}%</span>
        </div>
      </div>

      <div className="relative mb-8">
        <p className="text-xl leading-relaxed text-gray-700">{data.summary}</p>
      </div>

      <div className="relative mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-4 rounded-2xl bg-green-50 p-5 border border-green-100">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-green-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Pros
          </h3>
          <ul className="space-y-3">
            {data.pros.map((pro) => (
              <li key={pro} className="text-sm text-gray-600 leading-relaxed">
                {pro}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4 rounded-2xl bg-red-50 p-5 border border-red-100">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Cons
          </h3>
          <ul className="space-y-3">
            {data.cons.map((con) => (
              <li key={con} className="text-sm text-gray-600 leading-relaxed">
                {con}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="relative mb-8 rounded-2xl border border-gray-100 bg-gray-50 p-5">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-800 uppercase tracking-wide text-xs mr-2">
            Best for
          </span>
          {data.bestFor}
        </p>
      </div>

      <div className="space-y-4 border-t border-gray-100 pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Sources</p>
          {data.reviewEvidence ? (
            <span
              className={`text-[10px] font-medium uppercase tracking-wider ${
                data.reviewEvidence.hasUserReviewEvidence ? "text-green-500" : "text-yellow-500"
              }`}
            >
              {data.reviewEvidence.hasUserReviewEvidence
                ? "✓ Verified User Reviews"
                : "Editorial Sources"}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {data.sources.map((source) => (
            <a
              key={`${source.url}-${source.title}`}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-rose-500"
            >
              <span className="max-w-[180px] truncate">{source.title}</span>
              <svg
                className="h-3 w-3 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
