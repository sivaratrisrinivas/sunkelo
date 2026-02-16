import { describe, expect, it, vi } from "vitest";

import { collectReviewEvidence, getStrictEvidencePolicy, hasEnoughUserReviewEvidence } from "./review-evidence";

describe("review evidence policy", () => {
  it("collects ecommerce evidence and signal hits", () => {
    const evidence = collectReviewEvidence([
      {
        url: "https://www.flipkart.com/p/item/reviews",
        type: "ecommerce",
        content: "Verified purchase and great value for money",
      },
      {
        url: "https://www.amazon.in/product-reviews/B123",
        type: "ecommerce",
        content: "Customer reviews mention good delivery",
      },
      {
        url: "https://www.gsmarena.com/x-review-123.php",
        type: "blog",
        content: "Editorial review",
      },
    ]);

    expect(evidence.ecommerceSourceCount).toBe(2);
    expect(evidence.ecommerceDomains).toEqual(
      expect.arrayContaining(["www.flipkart.com", "www.amazon.in"]),
    );
    expect(evidence.reviewSignalCount).toBe(2);
    expect(evidence.hasUserReviewEvidence).toBe(true);
  });

  it("enforces strict thresholds only when enabled", () => {
    const weakEvidence = {
      totalSources: 3,
      ecommerceSourceCount: 1,
      ecommerceDomains: ["flipkart.com"],
      reviewSignalCount: 1,
      hasUserReviewEvidence: true,
    };

    expect(
      hasEnoughUserReviewEvidence(weakEvidence, {
        enabled: false,
        minEcommerceSources: 2,
        minReviewSignals: 2,
      }),
    ).toBe(true);

    expect(
      hasEnoughUserReviewEvidence(weakEvidence, {
        enabled: true,
        minEcommerceSources: 2,
        minReviewSignals: 2,
      }),
    ).toBe(false);
  });

  it("reads strict policy from env with sane defaults", () => {
    vi.stubEnv("STRICT_REVIEW_EVIDENCE_MODE", "true");
    vi.stubEnv("STRICT_REVIEW_MIN_ECOMMERCE_SOURCES", "3");
    vi.stubEnv("STRICT_REVIEW_MIN_SIGNAL_HITS", "4");

    const policy = getStrictEvidencePolicy();
    expect(policy).toEqual({
      enabled: true,
      minEcommerceSources: 3,
      minReviewSignals: 4,
    });

    vi.unstubAllEnvs();
  });
});
