import { getDisplayName, getScript } from "@/lib/utils/languages";

type LanguageBadgeProps = {
  languageCode: string;
};

export function LanguageBadge({ languageCode }: LanguageBadgeProps) {
  const display = getDisplayName(languageCode);
  const script = getScript(languageCode);
  const text = display === script ? display : `${display} · ${script}`;

  return (
    <span className="inline-flex items-center rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-1 text-[10px] font-medium tracking-wide text-[var(--accent-soft)]">
      {text}
    </span>
  );
}
