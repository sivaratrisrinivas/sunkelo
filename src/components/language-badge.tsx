import { getDisplayName, getScript } from "@/lib/utils/languages";

type LanguageBadgeProps = {
  languageCode: string;
};

export function LanguageBadge({ languageCode }: LanguageBadgeProps) {
  const display = getDisplayName(languageCode);
  const script = getScript(languageCode);
  const text = display === script ? display : `${display} · ${script}`;

  return (
    <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-[10px] font-semibold text-rose-500 transition-all hover:bg-rose-100">
      {text}
    </span>
  );
}
