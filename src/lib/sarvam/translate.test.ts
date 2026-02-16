import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequest = vi.fn();

vi.mock("./client", () => ({
  getSarvamClient: () => ({
    request: (...args: unknown[]) => mockRequest(...args),
  }),
}));

import { detectSourceLanguageCode, splitIntoTranslationChunks, translateLong, translateText } from "./translate";

describe("translateText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("translates text using Mayura payload", async () => {
    mockRequest.mockResolvedValueOnce({
      translated_text: "This phone is very good.",
    });

    const result = await translateText("यह फोन बहुत अच्छा है", {
      sourceLanguageCode: "hi-IN",
      targetLanguageCode: "en-IN",
    });

    expect(result).toBe("This phone is very good.");
    expect(mockRequest).toHaveBeenCalledWith(
      "/translate",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});

describe("translateLong", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("splits 2500-char text into <=1000-char chunks and reassembles in order", async () => {
    const longText = `${"A".repeat(950)}. ${"B".repeat(950)}. ${"C".repeat(650)}.`;
    mockRequest
      .mockResolvedValueOnce({ translated_text: "part-1" })
      .mockResolvedValueOnce({ translated_text: "part-2" })
      .mockResolvedValueOnce({ translated_text: "part-3" });

    const chunks = splitIntoTranslationChunks(longText);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.length <= 1000)).toBe(true);

    const translated = await translateLong(longText, {
      sourceLanguageCode: "hi-IN",
      targetLanguageCode: "en-IN",
    });
    expect(translated).toBe("part-1 part-2 part-3");
  });
});

describe("detectSourceLanguageCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts detected source language from translate API", async () => {
    mockRequest.mockResolvedValueOnce({
      translated_text: "hello",
      source_language_code: "as-IN",
    });

    const detected = await detectSourceLanguageCode("নমস্কাৰ");
    expect(detected).toBe("as-IN");
  });
});
