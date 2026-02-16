import { getDisplayName, getScript } from "@/lib/utils/languages";

type LanguageBadgeProps = {
  languageCode: string;
};

export function LanguageBadge({ languageCode }: LanguageBadgeProps) {
  const display = getDisplayName(languageCode);
  const script = getScript(languageCode);

  return (
    <span className="inline-flex items-center rounded-full border border-zinc-600 bg-zinc-900 px-3 py-1 text-xs text-zinc-200">
      {display} · {script}
    </span>
  );
}
