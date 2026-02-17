import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSarvamClient, SarvamError } from "./client";

// We need to reset the singleton between tests
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.stubEnv("SARVAM_API_KEY", "test-key");
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    // Reset the singleton client by clearing the module cache
    // We'll work around the singleton by testing the retry behavior
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

describe("Sarvam client retry", () => {
    it("succeeds on first attempt without retry", async () => {
        mockFetch.mockResolvedValueOnce(jsonResponse({ result: "ok" }));
        const client = getSarvamClient();
        const result = await client.request<{ result: string }>("/test");
        expect(result).toEqual({ result: "ok" });
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("retries once on 500 and succeeds", async () => {
        mockFetch
            .mockResolvedValueOnce(jsonResponse({}, 500))
            .mockResolvedValueOnce(jsonResponse({ result: "ok" }));

        const client = getSarvamClient();
        const result = await client.request<{ result: string }>("/retry-test");
        expect(result).toEqual({ result: "ok" });
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries once on 503 and succeeds", async () => {
        mockFetch
            .mockResolvedValueOnce(jsonResponse({}, 503))
            .mockResolvedValueOnce(jsonResponse({ result: "ok" }));

        const client = getSarvamClient();
        const result = await client.request<{ result: string }>("/retry-503");
        expect(result).toEqual({ result: "ok" });
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws SarvamError after both attempts fail with 500", async () => {
        mockFetch
            .mockResolvedValueOnce(jsonResponse({}, 500))
            .mockResolvedValueOnce(jsonResponse({}, 500));

        const client = getSarvamClient();
        await expect(client.request("/fail-test")).rejects.toThrow(SarvamError);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does not retry on 400 (non-retryable)", async () => {
        mockFetch.mockResolvedValueOnce(jsonResponse({}, 400));

        const client = getSarvamClient();
        await expect(client.request("/bad-request")).rejects.toThrow(SarvamError);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});
