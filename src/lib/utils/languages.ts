export const SUPPORTED_LANGUAGES = [
  "en-IN",
  "hi-IN",
  "bn-IN",
  "ta-IN",
  "te-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "gu-IN",
  "pa-IN",
  "od-IN",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const META: Record<SupportedLanguage, { displayName: string; script: string }> = {
  "en-IN": { displayName: "English", script: "English" },
  "hi-IN": { displayName: "Hindi", script: "हिन्दी" },
  "bn-IN": { displayName: "Bengali", script: "বাংলা" },
  "ta-IN": { displayName: "Tamil", script: "தமிழ்" },
  "te-IN": { displayName: "Telugu", script: "తెలుగు" },
  "kn-IN": { displayName: "Kannada", script: "ಕನ್ನಡ" },
  "ml-IN": { displayName: "Malayalam", script: "മലയാളം" },
  "mr-IN": { displayName: "Marathi", script: "मराठी" },
  "gu-IN": { displayName: "Gujarati", script: "ગુજરાતી" },
  "pa-IN": { displayName: "Punjabi", script: "ਪੰਜਾਬੀ" },
  "od-IN": { displayName: "Odia", script: "ଓଡ଼ିଆ" },
};

export function getDisplayName(languageCode: string): string {
  return META[languageCode as SupportedLanguage]?.displayName ?? "Unknown";
}

export function getScript(languageCode: string): string {
  return META[languageCode as SupportedLanguage]?.script ?? "Unknown";
}
