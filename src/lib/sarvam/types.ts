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
