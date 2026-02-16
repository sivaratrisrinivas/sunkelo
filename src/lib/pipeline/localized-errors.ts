import { createChatCompletion } from "@/lib/sarvam/chat";
import type { PipelineErrorCode } from "@/types/pipeline";

const BASE_MESSAGES: Record<PipelineErrorCode, string> = {
  NOT_A_PRODUCT: "Ask about any product review or comparison (phone, laptop, TV, earbuds, etc).",
  NO_REVIEWS: "This product doesn't have enough reviews yet. Try another popular product.",
  INSUFFICIENT_USER_REVIEW_EVIDENCE: "Not enough user-review evidence. Try another product.",
  RATE_LIMITED: "Daily query limit reached",
  STT_FAILED: "Failed to transcribe audio",
  SERVICE_UNAVAILABLE: "Unable to process request right now. Please try again in a moment.",
  INVALID_INPUT: "Input is invalid.",
  UNKNOWN: "Unknown error.",
};

function needsTranslation(languageCode: string): boolean {
  return Boolean(languageCode) && languageCode !== "en-IN";
}

export async function getLocalizedErrorMessage(
  code: PipelineErrorCode,
  languageCode: string,
): Promise<string> {
  const fallback = BASE_MESSAGES[code] ?? BASE_MESSAGES.UNKNOWN;
  if (!needsTranslation(languageCode)) {
    return fallback;
  }

  try {
    const translated = await createChatCompletion({
      model: "sarvam-m",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are an expert translator. Return only translated text with no quotes and no extra explanation.",
        },
        {
          role: "user",
          content: `Translate this error message from English to ${languageCode}: ${fallback}`,
        },
      ],
    });
    return translated.trim() || fallback;
  } catch {
    return fallback;
  }
}
