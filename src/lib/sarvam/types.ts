import { z } from "zod";
import { SUPPORTED_LANGUAGES } from "../utils/languages";

export const sttRequestSchema = z.object({
  model: z.literal("saaras:v3"),
  language_code: z.string().min(1),
});

export const sttResponseSchema = z.object({
  transcript: z.string().min(1),
  language_code: z.string().min(1).nullable(),
  language_probability: z.number().min(0).max(1).nullable(),
});

export type STTResponse = z.infer<typeof sttResponseSchema>;

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

export const chatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  reasoning_effort: z.null().optional(),
  messages: z.array(messageSchema).min(1),
});

export const chatCompletionUsageSchema = z
  .object({
    prompt_tokens: z.number().nonnegative().optional(),
    completion_tokens: z.number().nonnegative().optional(),
    total_tokens: z.number().nonnegative().optional(),
    prompt_tokens_details: z
      .object({
        cached_tokens: z.number().nonnegative().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    completion_tokens_details: z.unknown().nullable().optional(),
  })
  .passthrough()
  .nullable()
  .optional();

export const chatCompletionResponseSchema = z.object({
  id: z.string().optional(),
  choices: z
    .array(
      z
        .object({
          index: z.number().optional(),
          finish_reason: z.enum(["stop", "length", "tool_calls", "content_filter"]),
          logprobs: z.unknown().nullable().optional(),
          message: z
            .object({
              role: z.string().optional(),
              content: z.string().nullable().optional(),
              reasoning_content: z.string().nullable().optional(),
              refusal: z.string().nullable().optional(),
            })
            .passthrough(),
        })
        .passthrough(),
    )
    .min(1),
  usage: chatCompletionUsageSchema,
});

export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
}

export type ChatCompletionMessage = z.infer<typeof messageSchema>;
export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;
export type ChatCompletionResponse = z.infer<typeof chatCompletionResponseSchema>;

export const translationRequestSchema = z.object({
  input: z.string().min(1),
  source_language_code: z.string().min(1),
  target_language_code: z.string().min(1),
  model: z.union([z.literal("mayura:v1"), z.literal("sarvam-translate:v1")]),
  mode: z.enum(["formal", "modern-colloquial", "classic-colloquial", "code-mixed"]).optional(),
});

export const translationResponseSchema = z
  .object({
    translated_text: z.string().min(1).optional(),
    translation: z.string().min(1).optional(),
    output: z.string().min(1).optional(),
    source_language_code: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      typeof value.translated_text === "string" ||
      typeof value.translation === "string" ||
      typeof value.output === "string",
    {
      message: "Translation response must include translated text",
    },
  );

export type TranslationRequest = z.infer<typeof translationRequestSchema>;
export type TranslationResponse = z.infer<typeof translationResponseSchema>;

export const ttsRequestSchema = z.object({
  text: z.string().min(1).max(2500),
  target_language_code: z.enum(SUPPORTED_LANGUAGES),
  speaker: z.string().min(1),
  model: z.literal("bulbul:v3"),
});

export const ttsResponseSchema = z.object({
  request_id: z.string().optional(),
  audios: z.array(z.string().min(1)).min(1),
});

export type TTSRequest = z.infer<typeof ttsRequestSchema>;
export type TTSResponse = z.infer<typeof ttsResponseSchema>;
