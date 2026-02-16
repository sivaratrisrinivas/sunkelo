import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDetectSourceLanguageCode = vi.fn();

vi.mock("../sarvam/translate", () => ({
  detectSourceLanguageCode: (...args: unknown[]) => mockDetectSourceLanguageCode(...args),
}));

import { detectQueryLanguageCode } from "./query-language";

describe("detectQueryLanguageCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses Sarvam detected language when supported", async () => {
    mockDetectSourceLanguageCode.mockResolvedValueOnce("as-IN");
    await expect(detectQueryLanguageCode("নমস্কাৰ")).resolves.toBe("as-IN");
  });

  it("falls back to script detector on Sarvam failure", async () => {
    mockDetectSourceLanguageCode.mockRejectedValueOnce(new Error("network"));
    await expect(detectQueryLanguageCode("తెలుగు టెస్ట్")).resolves.toBe("te-IN");
  });
});
