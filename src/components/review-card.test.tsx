import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ReviewCard } from "./review-card";

describe("ReviewCard", () => {
  it("renders review data and external source links", () => {
    const html = renderToStaticMarkup(
      <ReviewCard
        data={{
          verdict: "buy",
          confidenceScore: 0.82,
          pros: ["Excellent battery", "Good camera", "Bright display"],
          cons: ["Bloatware"],
          bestFor: "Budget users",
          summary: "Strong value-for-money option in its segment.",
          reviewEvidence: {
            totalSources: 2,
            ecommerceSourceCount: 1,
            ecommerceDomains: ["flipkart.com"],
            reviewSignalCount: 1,
            hasUserReviewEvidence: true,
          },
          sources: [
            { title: "GSMArena", url: "https://example.com/gsmarena", type: "blog" },
            {
              title: "Flipkart",
              url: "https://example.com/flipkart",
              type: "ecommerce",
              site: "flipkart",
              productTitle: "Sample Phone",
              price: "₹19,999",
              currency: "INR",
              overallRating: 4.3,
              ratingsCount: 5012,
              reviewsCount: 1402,
              reviewSampleCount: 24,
              averageReviewRating: 4.1,
              sentimentBreakdown: { positive: 15, negative: 4, neutral: 3, mixed: 2 },
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Recommended");
    expect(html).toContain("Excellent battery");
    expect(html).toContain("Bloatware");
    expect(html).toContain("Best for");
    expect(html).toContain("User Review Snapshot");
    expect(html).toContain("Sample Phone");
    expect(html).toContain('target="_blank"');
  });

  it("renders loading skeleton with status role", () => {
    const html = renderToStaticMarkup(<ReviewCard loading />);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("Best for:");
  });
});
