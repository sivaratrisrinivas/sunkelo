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

    const content = await createChatCompletion({
      messages: [
        { role: "system", content: "Extract entity" },
        { role: "user", content: "Redmi Note 15 kaisa hai?" },
      ],
      model: "sarvam-m",
      temperature: 0.1,
    });

    expect(content).toContain('"intent":"product_review"');
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
