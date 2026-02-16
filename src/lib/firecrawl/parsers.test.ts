import { describe, expect, it } from "vitest";

import { FIRECRAWL_SOURCE_CONTENT_LIMIT, parseReviewMarkdown, parseScrapedSource } from "./parsers";

describe("parseReviewMarkdown", () => {
  it("extracts clean review text from raw markdown", () => {
    const markdown = `
# GSMArena Review
This phone has excellent battery life and display.

[Read more](https://example.com)
![hero](https://cdn.example.com/hero.png)
> advertisement
`;

    const parsed = parseReviewMarkdown(markdown);

    expect(parsed).toContain("This phone has excellent battery life and display.");
    expect(parsed).not.toContain("advertisement");
    expect(parsed).not.toContain("https://");
  });

  it("extracts user-review-like text from ecommerce markdown", () => {
    const markdown = `
## Flipkart User Reviews
- Good camera for this budget.
- Battery drains a bit fast.
- Value for money.
Privacy Policy
`;

    const parsed = parseReviewMarkdown(markdown);

    expect(parsed).toContain("Good camera for this budget.");
    expect(parsed).toContain("Battery drains a bit fast.");
    expect(parsed).toContain("Value for money.");
    expect(parsed).not.toContain("Privacy Policy");
  });

  it("truncates at sentence boundary near 2000 chars", () => {
    const sentence = "This is a useful sentence for testing truncation behavior. ";
    const markdown = sentence.repeat(80);

    const parsed = parseReviewMarkdown(markdown);

    expect(parsed.length).toBeLessThanOrEqual(FIRECRAWL_SOURCE_CONTENT_LIMIT);
    expect(/[.!?]$/.test(parsed)).toBe(true);
  });

  it("prioritizes ecommerce review-like sentences in parsed source", () => {
    const source = {
      url: "https://flipkart.com/p/reviews",
      title: "Flipkart reviews",
      type: "ecommerce" as const,
      content: `
        Shipping details. Privacy policy. Customer review: Great battery life and good display quality.
        Another buyer says camera quality is decent for this price.
        Refund policy. Verified purchase notes mention value for money.
      `,
    };

    const parsed = parseScrapedSource(source);
    expect(parsed.content.toLowerCase()).toContain("customer review");
    expect(parsed.content.toLowerCase()).toContain("value for money");
    expect(parsed.content.toLowerCase()).not.toContain("privacy policy");
  });
});
