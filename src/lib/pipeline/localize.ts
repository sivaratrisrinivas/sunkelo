import { upsertReviewTranslation } from "@/lib/db/reviews";
import { generateAudioScript } from "@/lib/gemini/gemini";
import { synthesizeTts, getWavDurationSeconds } from "@/lib/sarvam/tts";
import { translateLong } from "@/lib/sarvam/translate";
import { uploadTtsAudio } from "@/lib/storage/audio";
import type { SynthesizedReview } from "@/lib/pipeline/synthesize";
import { SUPPORTED_LANGUAGES } from "../utils/languages";

type LocalizeReviewInput = {
  reviewId: number;
  productSlug: string;
  productName: string;
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

function toSentenceList(items: string[]): string {
  if (!items.length) return "not enough repeated signals";
  return items.map((item) => item.replace(/\.$/, "").trim()).join(". ");
}

function buildSpeechFriendlyReviewText(review: SynthesizedReview): string {
  return [
    "Here is a plain-language review summary.",
    review.summary,
    `Quick verdict: ${review.verdict}.`,
    `What works well: ${toSentenceList(review.pros)}.`,
    `What may disappoint: ${toSentenceList(review.cons)}.`,
    `Best suited for: ${review.bestFor}.`,
    "That is the full review summary.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getAudioScript(review: SynthesizedReview, productName: string, languageCode: string): Promise<{ script: string; isTargetLanguage: boolean }> {
  try {
    const script = await generateAudioScript({ review, productName, languageCode });
    console.info("[localize] gemini audio script generated", {
      productName,
      languageCode,
      scriptLength: script.length,
    });
    return { script, isTargetLanguage: true };
  } catch (error) {
    console.warn("[localize] gemini audio script failed, using template fallback", {
      productName,
      error: error instanceof Error ? error.message : String(error),
    });
    return { script: buildSpeechFriendlyReviewText(review), isTargetLanguage: false };
  }
}

export async function localizeReview({
  reviewId,
  productSlug,
  productName,
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

  const localizedReview: SynthesizedReview = {
    ...review,
    summary: localizedSummary,
    tldr: localizedTldr,
  };

  console.info("[localize] start", {
    productName,
    targetLanguage,
    needsTranslation,
    ttsLanguageCode,
  });

  // Generate conversational audio script via Gemini (falls back to template)
  const { script: speechScript, isTargetLanguage: geminiProducedTargetLang } = await getAudioScript(localizedReview, productName, ttsLanguageCode);

  // If Gemini produced text in the target language, use it directly.
  // Otherwise (template fallback), translate if TTS language differs.
  let ttsInputText: string;
  if (geminiProducedTargetLang) {
    ttsInputText = speechScript;
    console.info("[localize] using gemini script directly for TTS", { ttsLanguageCode });
  } else if (ttsLanguageCode !== targetLanguage) {
    ttsInputText = await translateLong(speechScript, {
      sourceLanguageCode: targetLanguage,
      targetLanguageCode: "en-IN",
    });
    console.info("[localize] translated template fallback to TTS language", { ttsLanguageCode });
  } else {
    ttsInputText = speechScript;
    console.info("[localize] using template fallback directly for TTS", { ttsLanguageCode });
  }

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
    review: localizedReview,
    languageCode: targetLanguage,
    ttsLanguageCode,
    audioUrl,
    durationSeconds,
  };
}
