import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTranslateLong = vi.fn();
const mockSynthesizeTts = vi.fn();
const mockUploadTtsAudio = vi.fn();
const mockUpsertReviewTranslation = vi.fn();
const mockGetWavDurationSeconds = vi.fn();

vi.mock("@/lib/sarvam/translate", () => ({
  translateLong: (...args: unknown[]) => mockTranslateLong(...args),
}));

vi.mock("@/lib/sarvam/tts", () => ({
  synthesizeTts: (...args: unknown[]) => mockSynthesizeTts(...args),
  getWavDurationSeconds: (...args: unknown[]) => mockGetWavDurationSeconds(...args),
}));

vi.mock("@/lib/storage/audio", () => ({
  uploadTtsAudio: (...args: unknown[]) => mockUploadTtsAudio(...args),
}));

vi.mock("@/lib/db/reviews", () => ({
  upsertReviewTranslation: (...args: unknown[]) => mockUpsertReviewTranslation(...args),
}));

import { localizeReview } from "./localize";

const baseReview = {
  verdict: "buy" as const,
  pros: ["Great battery"],
  cons: ["Slow charging"],
  bestFor: "Everyday users",
  summary:
    "This is a long enough English summary that should satisfy the synthesis schema minimum character requirement for testing.",
  tldr: "Great battery life with decent overall value in this segment.",
  confidenceScore: 0.8,
  sources: [{ title: "R1", url: "https://example.com/r1", type: "blog" as const }],
};

describe("localizeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSynthesizeTts.mockResolvedValue(Buffer.from("RIFF"));
    mockUploadTtsAudio.mockResolvedValue("https://blob.example/audio.wav");
    mockGetWavDurationSeconds.mockReturnValue(2.5);
  });

  it("translates summary and tldr for non-English query and stores translation", async () => {
    mockTranslateLong.mockResolvedValueOnce("ଏହା ଅନୁବାଦିତ ସାରାଂଶ");
    mockTranslateLong.mockResolvedValueOnce("ଏହା ଅନୁବାଦିତ TLDR");

    const result = await localizeReview({
      reviewId: 10,
      productSlug: "redmi-note-15",
      review: baseReview,
      languageCode: "od-IN",
    });

    expect(mockTranslateLong).toHaveBeenCalledTimes(2);
    expect(mockSynthesizeTts).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "ଏହା ଅନୁବାଦିତ TLDR",
        languageCode: "od-IN",
      }),
    );
    expect(mockUpsertReviewTranslation).toHaveBeenCalledOnce();
    expect(result.review.summary).toBe("ଏହା ଅନୁବାଦିତ ସାରାଂଶ");
    expect(result.ttsLanguageCode).toBe("od-IN");
    expect(result.audioUrl).toBe("https://blob.example/audio.wav");
    expect(result.durationSeconds).toBe(2.5);
  });

  it("skips translation for en-IN and still generates TTS audio", async () => {
    const result = await localizeReview({
      reviewId: 11,
      productSlug: "iphone-16",
      review: baseReview,
      languageCode: "en-IN",
    });

    expect(mockTranslateLong).not.toHaveBeenCalled();
    expect(mockSynthesizeTts).toHaveBeenCalledWith(
      expect.objectContaining({
        text: baseReview.tldr,
        languageCode: "en-IN",
      }),
    );
    expect(mockUpsertReviewTranslation).not.toHaveBeenCalled();
    expect(result.review.summary).toBe(baseReview.summary);
    expect(result.ttsLanguageCode).toBe("en-IN");
  });

  it("falls back to English TTS for languages outside Bulbul support", async () => {
    mockTranslateLong.mockResolvedValueOnce("اردو سمری");
    mockTranslateLong.mockResolvedValueOnce("اردو TLDR");
    mockTranslateLong.mockResolvedValueOnce("English fallback TLDR");

    const result = await localizeReview({
      reviewId: 12,
      productSlug: "nothing-phone-3",
      review: baseReview,
      languageCode: "ur-IN",
    });

    expect(result.languageCode).toBe("ur-IN");
    expect(result.ttsLanguageCode).toBe("en-IN");
    expect(mockSynthesizeTts).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "English fallback TLDR",
        languageCode: "en-IN",
      }),
    );
  });

  it("returns data URL when blob upload fails", async () => {
    mockUploadTtsAudio.mockRejectedValueOnce(new Error("blob unavailable"));

    const result = await localizeReview({
      reviewId: 13,
      productSlug: "pixel-9",
      review: baseReview,
      languageCode: "en-IN",
    });

    expect(result.audioUrl?.startsWith("data:audio/wav;base64,")).toBe(true);
  });
});
