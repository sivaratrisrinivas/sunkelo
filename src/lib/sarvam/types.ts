import { z } from "zod";

export const sttRequestSchema = z.object({
  model: z.literal("saaras:v3"),
  language_code: z.string().min(1),
});

export const sttResponseSchema = z.object({
  transcript: z.string().min(1),
  language_code: z.string().min(1),
  language_probability: z.number().min(0).max(1),
});

export type STTResponse = z.infer<typeof sttResponseSchema>;

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

export const chatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  messages: z.array(messageSchema).min(1),
});

export const chatCompletionResponseSchema = z.object({
  id: z.string().optional(),
  choices: z
    .array(
      z.object({
        index: z.number().optional(),
        finish_reason: z.enum(["stop", "length", "tool_calls"]),
        message: z.object({
          role: z.string().optional(),
          content: z.string().min(1),
          reasoning_content: z.string().optional(),
        }),
      }),
    )
    .min(1),
});

export type ChatCompletionMessage = z.infer<typeof messageSchema>;
export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;
export type ChatCompletionResponse = z.infer<typeof chatCompletionResponseSchema>;

export const translationRequestSchema = z.object({
  input: z.string().min(1),
  source_language_code: z.string().min(1),
  target_language_code: z.string().min(1),
  model: z.literal("mayura:v1"),
  mode: z.literal("formal"),
});

export const translationResponseSchema = z
  .object({
    translated_text: z.string().min(1).optional(),
    translation: z.string().min(1).optional(),
    output: z.string().min(1).optional(),
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
