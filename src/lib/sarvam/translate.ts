import { getSarvamClient } from "./client";
import { translationRequestSchema, translationResponseSchema } from "./types";

const MAX_TRANSLATION_CHUNK = 1000;

export type TranslateParams = {
  sourceLanguageCode: string;
  targetLanguageCode: string;
};

const MAYURA_SUPPORTED_LANGUAGE_CODES = new Set([
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
]);

function chooseTranslationModel(sourceLanguageCode: string, targetLanguageCode: string) {
  if (
    MAYURA_SUPPORTED_LANGUAGE_CODES.has(sourceLanguageCode) &&
    MAYURA_SUPPORTED_LANGUAGE_CODES.has(targetLanguageCode)
  ) {
    return "mayura:v1" as const;
  }

  return "sarvam-translate:v1" as const;
}

export function splitIntoTranslationChunks(input: string, maxChunkSize = MAX_TRANSLATION_CHUNK): string[] {
  const normalized = input.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return [];
  }
  if (normalized.length <= maxChunkSize) {
    return [normalized];
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (!sentence) {
      continue;
    }

    if (sentence.length > maxChunkSize) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }

      for (let offset = 0; offset < sentence.length; offset += maxChunkSize) {
        chunks.push(sentence.slice(offset, offset + maxChunkSize).trim());
      }
      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxChunkSize) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current.trim());
  }

  return chunks.filter(Boolean);
}

export async function translateText(input: string, params: TranslateParams): Promise<string> {
  const model = chooseTranslationModel(params.sourceLanguageCode, params.targetLanguageCode);
  const payload = translationRequestSchema.parse({
    input,
    source_language_code: params.sourceLanguageCode,
    target_language_code: params.targetLanguageCode,
    model,
    mode: model === "mayura:v1" ? "formal" : undefined,
  });

  const client = getSarvamClient();
  const response = await client.request<unknown>("/translate", {
    method: "POST",
    headers: {
      "api-subscription-key": client.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const parsed = translationResponseSchema.parse(response);
  return (parsed.translated_text ?? parsed.translation ?? parsed.output ?? "").trim();
}

export async function detectSourceLanguageCode(input: string): Promise<string | null> {
  const normalized = input.trim();
  if (!normalized) {
    return null;
  }

  const client = getSarvamClient();
  const payload = translationRequestSchema.parse({
    input: normalized.slice(0, 1000),
    source_language_code: "auto",
    target_language_code: "en-IN",
    model: "sarvam-translate:v1",
  });

  const response = await client.request<unknown>("/translate", {
    method: "POST",
    headers: {
      "api-subscription-key": client.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const parsed = translationResponseSchema.parse(response);
  return parsed.source_language_code?.trim() || null;
}

export async function translateLong(input: string, params: TranslateParams): Promise<string> {
  const chunks = splitIntoTranslationChunks(input, MAX_TRANSLATION_CHUNK);
  if (!chunks.length) {
    return "";
  }

  const translated = await Promise.all(chunks.map((chunk) => translateText(chunk, params)));
  return translated.join(" ").replace(/\s+/g, " ").trim();
}

export const TRANSLATE_MAX_CHUNK_SIZE = MAX_TRANSLATION_CHUNK;
