import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock("./client", () => ({
    getRedisClient: () => ({
        get: (...args: unknown[]) => mockGet(...args),
        set: (...args: unknown[]) => mockSet(...args),
    }),
}));

vi.mock("@/lib/utils/constants", () => ({
    REVIEW_CACHE_TTL_DAYS: 7,
    LOCALIZED_CACHE_TTL_DAYS: 7,
}));

// Mock the synthesize module so its schema import doesn't fail
vi.mock("@/lib/pipeline/synthesize", () => ({
    synthesizedReviewSchema: {},
}));

import {
    getCachedReview,
    setCachedReview,
    getCachedLocalized,
    setCachedLocalized,
    getAlias,
    setAlias,
} from "./reviews";

const sampleReview = {
    verdict: "buy" as const,
    confidenceScore: 0.85,
    summary: "Great phone for the price.",
    tldr: "Good value budget phone.",
    pros: ["Battery", "Display"],
    cons: ["Camera"],
    bestFor: "Budget buyers",
    sources: [{ title: "GSMArena", url: "https://gsmarena.com/review", type: "blog" as const }],
};

describe("review cache", () => {
    beforeEach(() => vi.clearAllMocks());

    it("getCachedReview returns data on hit", async () => {
        mockGet.mockResolvedValueOnce(sampleReview);
        const result = await getCachedReview("redmi-note-15");
        expect(mockGet).toHaveBeenCalledWith("review:redmi-note-15");
        expect(result).toEqual(sampleReview);
    });

    it("getCachedReview returns null on miss", async () => {
        mockGet.mockResolvedValueOnce(null);
        const result = await getCachedReview("nonexistent");
        expect(result).toBeNull();
    });

    it("setCachedReview stores with correct TTL", async () => {
        mockSet.mockResolvedValueOnce("OK");
        await setCachedReview("redmi-note-15", sampleReview);
        expect(mockSet).toHaveBeenCalledWith("review:redmi-note-15", sampleReview, {
            ex: 7 * 24 * 60 * 60,
        });
    });

    it("getCachedReview returns null on Redis error", async () => {
        mockGet.mockRejectedValueOnce(new Error("Redis down"));
        const result = await getCachedReview("redmi-note-15");
        expect(result).toBeNull();
    });
});

describe("localized cache", () => {
    beforeEach(() => vi.clearAllMocks());

    const localizedData = {
        review: sampleReview,
        audioUrl: "https://blob.example/audio.wav",
        durationSeconds: 15,
        ttsLanguageCode: "hi-IN",
    };

    it("getCachedLocalized returns data on hit", async () => {
        mockGet.mockResolvedValueOnce(localizedData);
        const result = await getCachedLocalized("redmi-note-15", "hi-IN");
        expect(mockGet).toHaveBeenCalledWith("localized:redmi-note-15:hi-IN");
        expect(result).toEqual(localizedData);
    });

    it("getCachedLocalized returns null on miss", async () => {
        mockGet.mockResolvedValueOnce(null);
        const result = await getCachedLocalized("redmi-note-15", "te-IN");
        expect(result).toBeNull();
    });

    it("setCachedLocalized stores with correct TTL", async () => {
        mockSet.mockResolvedValueOnce("OK");
        await setCachedLocalized("redmi-note-15", "hi-IN", localizedData);
        expect(mockSet).toHaveBeenCalledWith(
            "localized:redmi-note-15:hi-IN",
            localizedData,
            { ex: 7 * 24 * 60 * 60 },
        );
    });
});

describe("alias cache", () => {
    beforeEach(() => vi.clearAllMocks());

    it("setAlias + getAlias round-trip", async () => {
        mockSet.mockResolvedValueOnce("OK");
        await setAlias("note 15", "redmi-note-15");
        expect(mockSet).toHaveBeenCalledWith("alias:note 15", "redmi-note-15", {
            ex: 30 * 24 * 60 * 60,
        });

        mockGet.mockResolvedValueOnce("redmi-note-15");
        const slug = await getAlias("note 15");
        expect(slug).toBe("redmi-note-15");
    });

    it("getAlias returns null for unknown alias", async () => {
        mockGet.mockResolvedValueOnce(null);
        const slug = await getAlias("unknown-product");
        expect(slug).toBeNull();
    });

    it("getAlias normalizes to lowercase", async () => {
        mockGet.mockResolvedValueOnce("redmi-note-15");
        await getAlias("Note 15");
        expect(mockGet).toHaveBeenCalledWith("alias:note 15");
    });
});
