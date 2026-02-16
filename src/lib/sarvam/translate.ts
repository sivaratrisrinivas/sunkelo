import { getSarvamClient } from "./client";
import { translationRequestSchema, translationResponseSchema } from "./types";

const MAX_TRANSLATION_CHUNK = 1000;

export type TranslateParams = {
  sourceLanguageCode: string;
  targetLanguageCode: string;
};

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
  const payload = translationRequestSchema.parse({
    input,
    source_language_code: params.sourceLanguageCode,
    target_language_code: params.targetLanguageCode,
    model: "mayura:v1",
    mode: "formal",
  });

  const client = getSarvamClient();
  const response = await client.request<unknown>("/translate", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const parsed = translationResponseSchema.parse(response);
  return (parsed.translated_text ?? parsed.translation ?? parsed.output ?? "").trim();
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
