import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateChatCompletion = vi.fn();

vi.mock("@/lib/sarvam/chat", () => ({
  createChatCompletion: (...args: unknown[]) => mockCreateChatCompletion(...args),
}));

import { getLocalizedErrorMessage } from "./localized-errors";

describe("getLocalizedErrorMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns fallback english message for en-IN", async () => {
    const message = await getLocalizedErrorMessage("NOT_A_PRODUCT", "en-IN");
    expect(message).toContain("Ask about any product review");
    expect(mockCreateChatCompletion).not.toHaveBeenCalled();
  });

  it("returns translated message for non-English language", async () => {
    mockCreateChatCompletion.mockResolvedValueOnce("किसी भी प्रोडक्ट रिव्यू या तुलना के बारे में पूछें।");
    const message = await getLocalizedErrorMessage("NOT_A_PRODUCT", "hi-IN");
    expect(message).toContain("प्रोडक्ट");
  });
});
