import type { ScrapedReviewSource } from "@/lib/firecrawl/scraper";
import { translateLong } from "@/lib/sarvam/translate";

export type NormalizedReviewSource = ScrapedReviewSource & {
  originalLanguageCode: string;
  translatedToEnglish: boolean;
};

const SCRIPT_DETECTORS: Array<{ code: string; regex: RegExp }> = [
  { code: "hi-IN", regex: /[\u0900-\u097F]/ }, // Devanagari
  { code: "bn-IN", regex: /[\u0980-\u09FF]/ }, // Bengali
  { code: "ta-IN", regex: /[\u0B80-\u0BFF]/ }, // Tamil
  { code: "te-IN", regex: /[\u0C00-\u0C7F]/ }, // Telugu
  { code: "kn-IN", regex: /[\u0C80-\u0CFF]/ }, // Kannada
  { code: "ml-IN", regex: /[\u0D00-\u0D7F]/ }, // Malayalam
  { code: "gu-IN", regex: /[\u0A80-\u0AFF]/ }, // Gujarati
  { code: "pa-IN", regex: /[\u0A00-\u0A7F]/ }, // Gurmukhi
  { code: "od-IN", regex: /[\u0B00-\u0B7F]/ }, // Odia
];

function detectLikelyLanguageCode(input: string): string {
  for (const detector of SCRIPT_DETECTORS) {
    if (detector.regex.test(input)) {
      return detector.code;
    }
  }

  // Heuristic: if only ASCII is present, treat as English.
  if (/^[\x00-\x7F]*$/.test(input)) {
    return "en-IN";
  }

  // Non-ASCII but unknown script: assume Indic and translate.
  return "hi-IN";
}

export async function normalizeSourcesToEnglish(
  sources: ScrapedReviewSource[],
): Promise<NormalizedReviewSource[]> {
  const normalized = await Promise.all(
    sources.map(async (source) => {
      const originalLanguageCode = detectLikelyLanguageCode(source.content);
      if (originalLanguageCode === "en-IN") {
        return {
          ...source,
          originalLanguageCode,
          translatedToEnglish: false,
        };
      }

      try {
        const translated = await translateLong(source.content, {
          sourceLanguageCode: originalLanguageCode,
          targetLanguageCode: "en-IN",
        });

        return {
          ...source,
          content: translated,
          originalLanguageCode,
          translatedToEnglish: true,
        };
      } catch {
        // Do not block the whole query when translation service is flaky.
        // Keep original content and let synthesis handle mixed-language corpus.
        return {
          ...source,
          originalLanguageCode,
          translatedToEnglish: false,
        };
      }
    }),
  );

  return normalized;
}
