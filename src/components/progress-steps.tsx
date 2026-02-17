"use client";

import { useMemo } from "react";

type ProgressStepKey =
  | "listening"
  | "understood"
  | "searching"
  | "analyzing"
  | "done"
  | "idle"
  | "error";

type ProgressStepsProps = {
  currentStep: ProgressStepKey;
  understoodProduct?: string | null;
};

const STEPS = [
  { key: "listening", label: "Listening" },
  { key: "understood", label: "Processing" },
  { key: "searching", label: "Searching" },
  { key: "analyzing", label: "Analyzing" },
] as const;

function computeActiveStepIndex(step: ProgressStepKey): number {
  if (step === "idle" || step === "error") {
    return -1;
  }

  if (step === "done") {
    return STEPS.length;
  }

  const index = STEPS.findIndex((s) => s.key === step);
  return index;
}

export function ProgressSteps({ currentStep, understoodProduct }: ProgressStepsProps) {
  const activeStepIndex = useMemo(() => computeActiveStepIndex(currentStep), [currentStep]);

  if (activeStepIndex === -1) return null;

  return (
    <ol aria-label="Query progress" className="flex flex-col items-center gap-4 animate-slide-up">
      <li className="flex items-center gap-3">
        {STEPS.map((step, index) => {
          const isActive = index === activeStepIndex;
          const isCompleted = index < activeStepIndex;

          return (
            <div key={step.key} className="flex items-center gap-3">
              {index > 0 && (
                <div
                  className={`h-px w-6 transition-all duration-500 ${isCompleted ? "bg-[var(--accent)]/40" : "bg-[var(--glass-border)]"
                    }`}
                />
              )}
              <div className="flex items-center gap-1.5">
                <div
                  className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${isActive
                    ? "bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]"
                    : isCompleted
                      ? "bg-[var(--accent)]/50"
                      : "bg-[var(--fg-faint)]/30"
                    }`}
                />
                <span
                  className={`text-[10px] tracking-wider transition-all duration-300 ${isActive ? "text-[var(--accent)]" : isCompleted ? "text-[var(--fg-faint)]" : "text-[var(--fg-faint)]/50"
                    }`}
                >
                  {isCompleted ? "✓" : step.label}
                </span>
              </div>
            </div>
          );
        })}
      </li>

      {understoodProduct && (
        <li className="animate-scale-in">
          <span className="inline-flex items-center rounded-full border border-[var(--glass-border)] bg-[var(--bg-surface)] px-4 py-1.5 text-xs text-[var(--fg-muted)]">
            Understood: {understoodProduct}
          </span>
        </li>
      )}

      <li className="hidden" />
      <li className="hidden" />
      <li className="hidden" />
    </ol>
  );
}
