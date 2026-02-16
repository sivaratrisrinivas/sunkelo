import { describe, expect, it } from "vitest";

import {
  chatCompletionResponseSchema,
  sttResponseSchema,
  translationRequestSchema,
  translationResponseSchema,
} from "./types";

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

describe("translation schemas", () => {
  it("parses valid translation request and response", () => {
    const request = translationRequestSchema.parse({
      input: "यह फोन बहुत अच्छा है",
      source_language_code: "hi-IN",
      target_language_code: "en-IN",
      model: "mayura:v1",
      mode: "formal",
    });
    const response = translationResponseSchema.parse({
      translated_text: "This phone is very good.",
    });

    expect(request.model).toBe("mayura:v1");
    expect(response.translated_text).toBe("This phone is very good.");
  });

  it("fails when translated text is empty", () => {
    expect(() =>
      translationResponseSchema.parse({
        translated_text: "",
      }),
    ).toThrow();
  });
});
