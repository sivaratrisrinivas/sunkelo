import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractIntentAndEntity, resolveCanonicalSlug } from "./entity";

const mockCreateChatCompletion = vi.fn();
const mockRedisGet = vi.fn();
const mockGetBySlug = vi.fn();

vi.mock("../sarvam/chat", () => ({
  createChatCompletion: (...args: unknown[]) => mockCreateChatCompletion(...args),
}));

vi.mock("../cache/client", () => ({
  getRedisClient: () => ({
    get: (...args: unknown[]) => mockRedisGet(...args),
  }),
}));

vi.mock("../db/products", () => ({
  getBySlug: (...args: unknown[]) => mockGetBySlug(...args),
}));

describe("extractIntentAndEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts product intent and slug", async () => {
    mockCreateChatCompletion.mockResolvedValueOnce(
      '{"intent":"product_review","brand":"Redmi","model":"Note 15","variant":null}',
    );

    const result = await extractIntentAndEntity("Redmi Note 15 kaisa hai?");
    expect(result.intent).toBe("product_review");
    expect(result.brand).toBe("Redmi");
    expect(result.model).toBe("Note 15");
    expect(result.slug).toBe("redmi-note-15");
  });

  it("returns unsupported for non-product query", async () => {
    mockCreateChatCompletion.mockResolvedValueOnce(
      '{"intent":"unsupported","brand":null,"model":null,"variant":null}',
    );

    const result = await extractIntentAndEntity("weather kya hai?");
    expect(result.intent).toBe("unsupported");
    expect(result.slug).toBeNull();
  });
});

describe("resolveCanonicalSlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves slug from alias cache first", async () => {
    mockRedisGet.mockResolvedValueOnce("redmi-note-15");

    const slug = await resolveCanonicalSlug({
      transcript: "note 15",
      extractedSlug: "note-15",
    });

    expect(slug).toBe("redmi-note-15");
    expect(mockGetBySlug).not.toHaveBeenCalled();
  });

  it("falls back to postgres slug match when alias missing", async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockGetBySlug.mockResolvedValueOnce({ slug: "iphone-16-pro-max" });

    const slug = await resolveCanonicalSlug({
      transcript: "iPhone 16 Pro Max review",
      extractedSlug: "iphone-16-pro-max",
    });

    expect(slug).toBe("iphone-16-pro-max");
  });

  it("falls back to extracted slug when no match found", async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockGetBySlug.mockResolvedValueOnce(null);

    const slug = await resolveCanonicalSlug({
      transcript: "unknown x1",
      extractedSlug: "unknown-x1",
    });

    expect(slug).toBe("unknown-x1");
  });
});
