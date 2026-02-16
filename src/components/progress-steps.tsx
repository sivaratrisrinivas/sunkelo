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

  const progressPercent = Math.min(100, Math.max(0, ((activeStepIndex + 1) / STEPS.length) * 100));

  return (
    <div className="w-full space-y-5 animate-fade-up">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-700 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex justify-between px-1">
        {STEPS.map((step, index) => {
          const isActive = index === activeStepIndex;
          const isCompleted = index < activeStepIndex;

          return (
            <div
              key={step.key}
              className={`flex flex-col items-center gap-2.5 transition-all duration-500 ${
                isActive ? "scale-105" : ""
              }`}
            >
              <div
                className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${
                  isActive
                    ? "bg-rose-500 shadow-lg shadow-rose-500/40"
                    : isCompleted
                      ? "bg-rose-300"
                      : "bg-gray-200"
                }`}
              />
              <span
                className={`text-[10px] font-medium transition-all duration-300 ${
                  isActive ? "text-rose-500" : isCompleted ? "text-gray-400" : "text-gray-300"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {understoodProduct && (
        <div className="text-center animate-fade-up">
          <p className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-xs font-medium text-gray-600 shadow-sm">
            <span className="text-gray-400">Identified:</span>
            <span className="text-gray-800">{understoodProduct}</span>
          </p>
        </div>
      )}
    </div>
  );
}
