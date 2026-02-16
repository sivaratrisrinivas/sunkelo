import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockCheckRateLimit = vi.fn();
const mockTranscribeAudio = vi.fn();
const mockExtractIntentAndEntity = vi.fn();
const mockResolveCanonicalSlug = vi.fn();

vi.mock("@/lib/cache/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@/lib/sarvam/stt", () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
}));

vi.mock("@/lib/pipeline/entity", () => ({
  extractIntentAndEntity: (...args: unknown[]) => mockExtractIntentAndEntity(...args),
  resolveCanonicalSlug: (...args: unknown[]) => mockResolveCanonicalSlug(...args),
}));

vi.mock("@/lib/pipeline/orchestrator", () => ({
  createSSEStream: (run: (emitEvent: (type: string, data: unknown) => void) => Promise<void> | void) => {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const emitEvent = (type: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        await run(emitEvent);
        controller.close();
      },
    });
  },
}));

vi.mock("@/lib/utils/constants", () => ({
  MAX_AUDIO_UPLOAD_BYTES: 10 * 1024 * 1024,
}));

vi.mock("@/lib/utils/ip-hash", () => ({
  hashIpFromHeader: () => "hashed-ip",
}));

import { POST } from "./route";

type ParsedSSEEvent = {
  type: string;
  data: Record<string, unknown>;
};

function parseSSE(raw: string): ParsedSSEEvent[] {
  const blocks = raw
    .split("\n\n")
    .map((value) => value.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const lines = block.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event: "));
    const dataLine = lines.find((line) => line.startsWith("data: "));
    return {
      type: eventLine?.replace("event: ", "") ?? "",
      data: JSON.parse(dataLine?.replace("data: ", "") ?? "{}"),
    };
  });
}

describe("POST /api/query sprint 3 flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 1000,
    });
  });

  it("emits understood and searching statuses for product intent", async () => {
    mockExtractIntentAndEntity.mockResolvedValueOnce({
      intent: "product_review",
      brand: "Redmi",
      model: "Note 15",
      variant: null,
      slug: "redmi-note-15",
      productName: "Redmi Note 15",
    });
    mockResolveCanonicalSlug.mockResolvedValueOnce("redmi-note-15");

    const request = new Request("http://localhost/api/query", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "1.1.1.1",
      },
      body: JSON.stringify({ text: "Redmi Note 15 kaisa hai?" }),
    }) as NextRequest;

    const response = await POST(request);
    const body = await response.text();
    const events = parseSSE(body);

    expect(events.map((event) => event.type)).toEqual(["status", "status", "status", "done"]);
    expect(events[1].data).toMatchObject({
      status: "understood",
      context: { transcript: "Redmi Note 15 kaisa hai?", language: "en-IN" },
    });
    expect(events[2].data).toMatchObject({
      status: "searching",
      context: { product: "Redmi Note 15", productSlug: "redmi-note-15" },
    });
  });

  it("emits NOT_A_PRODUCT error for unsupported intent", async () => {
    mockExtractIntentAndEntity.mockResolvedValueOnce({
      intent: "unsupported",
      brand: null,
      model: null,
      variant: null,
      slug: null,
      productName: null,
    });

    const request = new Request("http://localhost/api/query", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "2.2.2.2",
      },
      body: JSON.stringify({ text: "weather kya hai?" }),
    }) as NextRequest;

    const response = await POST(request);
    const body = await response.text();
    const events = parseSSE(body);

    expect(events.map((event) => event.type)).toEqual(["status", "status", "error", "done"]);
    expect(events[2].data).toMatchObject({
      code: "NOT_A_PRODUCT",
    });
  });
});
