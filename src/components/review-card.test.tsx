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
            { title: "Flipkart", url: "https://example.com/flipkart", type: "ecommerce" },
          ],
        }}
      />,
    );

    expect(html).toContain("Buy");
    expect(html).toContain("Excellent battery");
    expect(html).toContain("Bloatware");
    expect(html).toContain("Best for:");
    expect(html).toContain("User review evidence:");
    expect(html).toContain('target="_blank"');
  });

  it("renders loading skeleton with status role", () => {
    const html = renderToStaticMarkup(<ReviewCard loading />);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("Best for:");
  });
});
