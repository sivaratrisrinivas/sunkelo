import { getSarvamClient, SarvamError } from "./client";
import {
  chatCompletionRequestSchema,
  chatCompletionResponseSchema,
  type ChatCompletionMessage,
} from "./types";

export class RateLimitError extends Error {
  constructor(message = "Sarvam rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}

type ChatCompletionInput = {
  messages: ChatCompletionMessage[];
  model?: string;
  temperature?: number;
};

export async function createChatCompletion({
  messages,
  model = "sarvam-m",
  temperature = 0.1,
}: ChatCompletionInput): Promise<string> {
  const payload = chatCompletionRequestSchema.parse({
    model,
    temperature,
    messages,
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

  const parsed = chatCompletionResponseSchema.parse(await response.json());
  return parsed.choices[0].message.content.trim();
}
