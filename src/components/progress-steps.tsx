type ProgressStepKey = "listening" | "understood" | "searching" | "analyzing" | "done";

type ProgressStepsProps = {
  currentStep: ProgressStepKey | "idle" | "error";
  understoodProduct?: string | null;
};

type StepDef = {
  key: ProgressStepKey;
  label: string;
};

const STEPS: StepDef[] = [
  { key: "listening", label: "Listening" },
  { key: "understood", label: "Understood" },
  { key: "searching", label: "Searching" },
  { key: "analyzing", label: "Analyzing" },
  { key: "done", label: "Done" },
];

const stepOrder = STEPS.reduce<Record<ProgressStepKey, number>>((acc, step, index) => {
  acc[step.key] = index;
  return acc;
}, {} as Record<ProgressStepKey, number>);

export function ProgressSteps({ currentStep, understoodProduct }: ProgressStepsProps) {
  if (currentStep === "idle") {
    return null;
  }

  return (
    <ol aria-label="Query progress" className="w-full space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      {STEPS.map((step) => {
        const active = currentStep !== "error" && currentStep === step.key;
        const completed =
          currentStep !== "error" &&
          stepOrder[currentStep as ProgressStepKey] >= stepOrder[step.key];
        const bullet = completed ? "✓" : active ? "●" : "○";
        const label =
          step.key === "understood" && understoodProduct
            ? `${step.label}: ${understoodProduct}`
            : step.label;

        return (
          <li
            key={step.key}
            className={`flex items-center gap-3 text-sm ${
              completed ? "text-green-300" : active ? "text-zinc-100" : "text-zinc-400"
            }`}
          >
            <span className={active && !completed ? "animate-pulse" : ""} aria-hidden>
              {bullet}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
