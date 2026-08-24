import { beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

describe("createChatCompletion", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...originalEnv, SARVAM_API_KEY: "test-key", SARVAM_BASE_URL: "https://api.sarvam.ai" };
  });

  it("returns parsed completion content on success", async () => {
    const { createChatCompletion } = await import("./chat");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: '{"intent":"product_review","brand":"Redmi","model":"Note 15","variant":null}',
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await createChatCompletion({
      messages: [
        { role: "system", content: "Extract entity" },
        { role: "user", content: "Redmi Note 15 kaisa hai?" },
      ],
      model: "sarvam-m",
      temperature: 0.1,
    });

    expect(result.content).toContain('"intent":"product_review"');
  });

  it("sends sarvam-105b with reasoning disabled and subscription key by default", async () => {
    const { createChatCompletion, SARVAM_CHAT_MODEL } = await import("./chat");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: '{"ok":true}' },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 4,
            prompt_tokens_details: { cached_tokens: 2 },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await createChatCompletion({
      messages: [{ role: "user", content: "ping" }],
      reasoningEffort: null,
      maxTokens: 4096,
    });

    expect(SARVAM_CHAT_MODEL).toBe("sarvam-105b");
    expect(result.content).toBe('{"ok":true}');
    expect(result.usage).toEqual({
      promptTokens: 10,
      cachedPromptTokens: 2,
      completionTokens: 4,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sarvam.ai/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers["api-subscription-key"]).toBe("test-key");
    expect(JSON.parse(String(init.body))).toEqual(
      expect.objectContaining({
        model: "sarvam-105b",
        reasoning_effort: null,
        max_tokens: 4096,
      }),
    );
  });

  it("accepts the live sarvam-105b 200 body with null reasoning_content and prompt_tokens_details", async () => {
    const { createChatCompletion } = await import("./chat");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "chatcmpl-live-probe",
          model: "sarvam-105b",
          choices: [
            {
              finish_reason: "stop",
              logprobs: null,
              message: {
                role: "assistant",
                content: "pong",
                reasoning_content: null,
              },
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 1,
            total_tokens: 13,
            prompt_tokens_details: null,
            completion_tokens_details: null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await createChatCompletion({
      messages: [{ role: "user", content: "ping" }],
      reasoningEffort: null,
      maxTokens: 64,
    });

    expect(result.content).toBe("pong");
    expect(result.usage).toEqual({
      promptTokens: 12,
      cachedPromptTokens: 0,
      completionTokens: 1,
    });
  });

  it("throws SarvamError with Zod path when the 200 body fails the response schema", async () => {
    const { createChatCompletion } = await import("./chat");
    const { SarvamError } = await import("./client");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: "pong", reasoning_content: 12 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      createChatCompletion({
        messages: [{ role: "user", content: "ping" }],
        reasoningEffort: null,
        maxTokens: 64,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof SarvamError &&
        error.status === 200 &&
        error.message.includes("choices.0.message.reasoning_content") &&
        error.message.includes("200")
      );
    });
  });

  it("throws RateLimitError on 429", async () => {
    const { createChatCompletion, RateLimitError } = await import("./chat");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 429 }));

    await expect(
      createChatCompletion({
        messages: [
          { role: "system", content: "Extract entity" },
          { role: "user", content: "Redmi Note 15 kaisa hai?" },
        ],
      }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("throws SarvamError on 500/503", async () => {
    const { createChatCompletion } = await import("./chat");
    const { SarvamError } = await import("./client");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(
      createChatCompletion({
        messages: [
          { role: "system", content: "Extract entity" },
          { role: "user", content: "Redmi Note 15 kaisa hai?" },
        ],
      }),
    ).rejects.toBeInstanceOf(SarvamError);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await expect(
      createChatCompletion({
        messages: [
          { role: "system", content: "Extract entity" },
          { role: "user", content: "Redmi Note 15 kaisa hai?" },
        ],
      }),
    ).rejects.toBeInstanceOf(SarvamError);
  });

  it("throws ConfigError when API key is missing", async () => {
    const { createChatCompletion } = await import("./chat");
    const { ConfigError } = await import("./client");
    process.env = { ...originalEnv };
    delete process.env.SARVAM_API_KEY;

    await expect(
      createChatCompletion({
        messages: [
          { role: "system", content: "Extract entity" },
          { role: "user", content: "Redmi Note 15 kaisa hai?" },
        ],
      }),
    ).rejects.toBeInstanceOf(ConfigError);
  });
});
