import { describe, expect, it } from "vitest";

import { sttResponseSchema } from "./types";

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
