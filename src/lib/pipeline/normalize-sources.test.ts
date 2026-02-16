import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTranslateLong = vi.fn();

vi.mock("@/lib/sarvam/translate", () => ({
  translateLong: (...args: unknown[]) => mockTranslateLong(...args),
}));

import { normalizeSourcesToEnglish } from "./normalize-sources";

describe("normalizeSourcesToEnglish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes mixed-language sources to English", async () => {
    mockTranslateLong.mockResolvedValueOnce("This phone is very good.");
    mockTranslateLong.mockResolvedValueOnce("The display is excellent.");

    const sources = [
      {
        url: "https://example.com/en",
        title: "EN",
        type: "blog" as const,
        content: "Battery life is solid and camera is reliable.",
      },
      {
        url: "https://example.com/hi",
        title: "HI",
        type: "ecommerce" as const,
        content: "यह फोन बहुत अच्छा है।",
      },
      {
        url: "https://example.com/ta",
        title: "TA",
        type: "youtube" as const,
        content: "இந்த திரை தரம் அருமை.",
      },
    ];

    const normalized = await normalizeSourcesToEnglish(sources);

    expect(normalized).toHaveLength(3);
    expect(normalized[0].content).toContain("Battery life");
    expect(normalized[1].content).toBe("This phone is very good.");
    expect(normalized[2].content).toBe("The display is excellent.");
    expect(mockTranslateLong).toHaveBeenCalledTimes(2);
  });

  it("skips translation for already-English sources", async () => {
    const normalized = await normalizeSourcesToEnglish([
      {
        url: "https://example.com/en-only",
        title: "EN",
        type: "blog" as const,
        content: "Excellent value and fast performance.",
      },
    ]);

    expect(normalized[0].translatedToEnglish).toBe(false);
    expect(mockTranslateLong).not.toHaveBeenCalled();
  });
});
