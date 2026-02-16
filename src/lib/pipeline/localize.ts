import { upsertReviewTranslation } from "@/lib/db/reviews";
import { synthesizeTts, getWavDurationSeconds } from "@/lib/sarvam/tts";
import { translateLong } from "@/lib/sarvam/translate";
import { uploadTtsAudio } from "@/lib/storage/audio";
import type { SynthesizedReview } from "@/lib/pipeline/synthesize";
import { SUPPORTED_LANGUAGES } from "../utils/languages";

type LocalizeReviewInput = {
  reviewId: number;
  productSlug: string;
  review: SynthesizedReview;
  languageCode: string;
};

export type LocalizedReviewResult = {
  review: SynthesizedReview;
  languageCode: string;
  ttsLanguageCode: string;
  audioUrl: string | null;
  durationSeconds: number | null;
};

const BULBUL_SUPPORTED_LANGUAGE_CODES = new Set<string>(SUPPORTED_LANGUAGES);

export async function localizeReview({
  reviewId,
  productSlug,
  review,
  languageCode,
}: LocalizeReviewInput): Promise<LocalizedReviewResult> {
  const targetLanguage = languageCode || "en-IN";
  const needsTranslation = targetLanguage !== "en-IN";

  const [localizedSummary, localizedTldr] = needsTranslation
    ? await Promise.all([
        translateLong(review.summary, {
          sourceLanguageCode: "en-IN",
          targetLanguageCode: targetLanguage,
        }),
        translateLong(review.tldr, {
          sourceLanguageCode: "en-IN",
          targetLanguageCode: targetLanguage,
        }),
      ])
    : [review.summary, review.tldr];

  const ttsLanguageCode = BULBUL_SUPPORTED_LANGUAGE_CODES.has(targetLanguage) ? targetLanguage : "en-IN";
  const ttsInputText =
    ttsLanguageCode === targetLanguage
      ? localizedTldr
      : await translateLong(localizedTldr, {
          sourceLanguageCode: targetLanguage,
          targetLanguageCode: "en-IN",
        });

  const ttsAudio = await synthesizeTts({
    text: ttsInputText,
    languageCode: ttsLanguageCode,
  });
  const audioUrl = await uploadTtsAudio({
    productSlug,
    reviewId,
    languageCode: targetLanguage,
    audio: ttsAudio,
  }).catch(() => `data:audio/wav;base64,${ttsAudio.toString("base64")}`);
  const durationSeconds = getWavDurationSeconds(ttsAudio);

  if (needsTranslation) {
    try {
      await upsertReviewTranslation({
        reviewId,
        languageCode: targetLanguage,
        summary: localizedSummary,
        tldr: localizedTldr,
        audioUrl,
      });
    } catch {
      // Localization should continue even if translation persistence fails.
    }
  }

  return {
    review: {
      ...review,
      summary: localizedSummary,
      tldr: localizedTldr,
    },
    languageCode: targetLanguage,
    ttsLanguageCode,
    audioUrl,
    durationSeconds,
  };
}
