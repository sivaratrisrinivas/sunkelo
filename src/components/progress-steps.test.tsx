import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ProgressSteps } from "./progress-steps";

function countOccurrences(input: string, token: string): number {
  return input.split(token).length - 1;
}

describe("ProgressSteps", () => {
  it("renders expected step states for searching phase", () => {
    const html = renderToStaticMarkup(
      <ProgressSteps currentStep="searching" understoodProduct="Redmi Note 15" />,
    );

    expect(html).toContain('aria-label="Query progress"');
    expect(html).toContain("Understood: Redmi Note 15");
    expect(html).toContain("Searching");
    expect(countOccurrences(html, "<li")).toBe(5);
    expect(html).toContain("✓");
  });

  it("renders nothing for idle state", () => {
    const html = renderToStaticMarkup(<ProgressSteps currentStep="idle" />);
    expect(html).toBe("");
  });
});
