import { describe, expect, it } from "vitest";

import { chatCompletionResponseSchema, sttResponseSchema } from "./types";

describe("sttResponseSchema", () => {
  it("parses valid payload", () => {
    const parsed = sttResponseSchema.parse({
      transcript: "Redmi Note 15",
      language_code: "hi-IN",
      language_probability: 0.93,
    });

    expect(parsed.transcript).toBe("Redmi Note 15");
  });

  it("fails on missing transcript", () => {
    expect(() =>
      sttResponseSchema.parse({
        language_code: "hi-IN",
        language_probability: 0.8,
      }),
    ).toThrow();
  });

  it("fails when probability is out of range", () => {
    expect(() =>
      sttResponseSchema.parse({
        transcript: "ok",
        language_code: "hi-IN",
        language_probability: 2,
      }),
    ).toThrow();
  });
});

describe("chatCompletionResponseSchema", () => {
  it("parses valid completion with optional reasoning content", () => {
    const parsed = chatCompletionResponseSchema.parse({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: '{"intent":"product_review"}',
            reasoning_content: "internal reasoning",
          },
        },
      ],
    });

    expect(parsed.choices[0].message.content).toContain("intent");
  });

  it("fails on invalid finish reason", () => {
    expect(() =>
      chatCompletionResponseSchema.parse({
        choices: [
          {
            finish_reason: "invalid",
            message: {
              content: "{}",
            },
          },
        ],
      }),
    ).toThrow();
  });
});
