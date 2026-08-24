import { getSarvamClient, SarvamError } from "./client";
import {
  chatCompletionRequestSchema,
  chatCompletionResponseSchema,
  formatZodIssues,
  type ChatCompletionMessage,
} from "./types";

export class RateLimitError extends Error {
  constructor(message = "Sarvam rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}

export const SARVAM_CHAT_MODEL = "sarvam-105b";

export type ChatCompletionUsage = {
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
};

export type ChatCompletionResult = {
  content: string;
  usage: ChatCompletionUsage | null;
};

type ChatCompletionInput = {
  messages: ChatCompletionMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: null;
};

function parseUsage(
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number } | null;
      }
    | null
    | undefined,
): ChatCompletionUsage | null {
  if (!usage) {
    return null;
  }
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  if (typeof promptTokens !== "number" && typeof completionTokens !== "number") {
    return null;
  }
  return {
    promptTokens: promptTokens ?? 0,
    cachedPromptTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: completionTokens ?? 0,
  };
}

export function addChatUsage(
  left: ChatCompletionUsage | null,
  right: ChatCompletionUsage | null,
): ChatCompletionUsage | null {
  if (!left && !right) {
    return null;
  }
  return {
    promptTokens: (left?.promptTokens ?? 0) + (right?.promptTokens ?? 0),
    cachedPromptTokens: (left?.cachedPromptTokens ?? 0) + (right?.cachedPromptTokens ?? 0),
    completionTokens: (left?.completionTokens ?? 0) + (right?.completionTokens ?? 0),
  };
}

export async function createChatCompletion({
  messages,
  model = SARVAM_CHAT_MODEL,
  temperature = 0.1,
  maxTokens,
  reasoningEffort,
}: ChatCompletionInput): Promise<ChatCompletionResult> {
  const payload = chatCompletionRequestSchema.parse({
    model,
    temperature,
    messages,
    max_tokens: maxTokens,
    reasoning_effort: reasoningEffort,
  });
  const client = getSarvamClient();
  const payloadJson = JSON.stringify(payload);
  const payloadBytes = Buffer.byteLength(payloadJson, "utf8");
  const messageCharStats = messages.map((message) => ({
    role: message.role,
    chars: message.content.length,
  }));

  const response = await fetch(`${client.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${client.apiKey}`,
      "api-subscription-key": client.apiKey,
      "Content-Type": "application/json",
    },
    body: payloadJson,
  });

  if (response.status === 429) {
    throw new RateLimitError();
  }
  if ([500, 503].includes(response.status)) {
    throw new SarvamError("Sarvam service unavailable", response.status);
  }
  if (!response.ok) {
    const rawErrorBody = await response.text().catch(() => "");
    const safeErrorBody = rawErrorBody.slice(0, 1000);
    console.error("[sarvam.chat] completion request failed", {
      status: response.status,
      model,
      temperature,
      payloadBytes,
      messageCount: messages.length,
      messageCharStats,
      responseBodyPreview: safeErrorBody,
    });
    throw new SarvamError(
      `Sarvam chat request failed with ${response.status}${safeErrorBody ? `: ${safeErrorBody}` : ""}`,
      response.status,
    );
  }

  const parsed = chatCompletionResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new SarvamError(
      `Sarvam chat response schema failed (${response.status}): ${formatZodIssues(parsed.error)}`,
      response.status,
    );
  }
  const content = parsed.data.choices[0].message.content?.trim() ?? "";
  if (!content) {
    throw new SarvamError(
      "Sarvam returned empty content; reasoning tokens may have consumed max_tokens",
      response.status,
    );
  }
  return {
    content,
    usage: parseUsage(parsed.data.usage),
  };
}
