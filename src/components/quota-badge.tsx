"use client";

type QuotaBadgeProps = {
    remaining: number;
    total: number;
};

export function QuotaBadge({ remaining, total }: QuotaBadgeProps) {
    const isLow = remaining <= 1;

    return (
        <div
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tracking-wide transition-colors ${isLow
                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                    : "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20"
                }`}
        >
            <span className="tabular-nums">
                {remaining}/{total}
            </span>
            <span className="opacity-75">queries left today</span>
        </div>
    );
}
