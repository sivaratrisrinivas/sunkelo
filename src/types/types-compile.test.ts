import { describe, expect, it } from "vitest";

import type { ApiError } from "./api";
import type { QueryContext } from "./pipeline";
import type { Product } from "./product";
import type { Review } from "./review";

describe("type imports", () => {
  it("types are importable", () => {
    const product: Product = {
      id: 1,
      brand: "Xiaomi",
      model: "Redmi Note 15",
      slug: "redmi-note-15",
      priceRange: "INR 20,000",
      isTrending: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const review: Review = {
      id: 1,
      productId: product.id,
      languageCode: "en-IN",
      verdict: "buy",
      confidenceScore: 0.8,
      summary: "Good value.",
      tldr: "Strong buy.",
      pros: ["Battery"],
      cons: ["Bloatware"],
      sources: [{ title: "Test", url: "https://example.com" }],
      createdAt: new Date(),
    };

    const context: QueryContext = { product: product.model, cached: false };
    const error: ApiError = { code: "UNKNOWN", message: "none" };

    expect(review.productId).toBe(product.id);
    expect(context.product).toBe("Redmi Note 15");
    expect(error.code).toBe("UNKNOWN");
  });
});
