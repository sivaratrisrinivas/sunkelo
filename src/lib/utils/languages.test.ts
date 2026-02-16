import { describe, expect, it } from "vitest";

import { getDisplayName, getScript, SUPPORTED_LANGUAGES } from "./languages";

describe("languages", () => {
  it("resolves display names", () => {
    expect(getDisplayName("hi-IN")).toBe("Hindi");
  });

  it("resolves script labels", () => {
    expect(getScript("od-IN")).toBe("ଓଡ଼ିଆ");
  });

  it("contains exactly 11 supported languages", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(11);
  });
});
