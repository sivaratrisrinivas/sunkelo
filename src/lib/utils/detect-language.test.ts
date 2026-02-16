import { describe, expect, it } from "vitest";

import { detectLanguageCodeFromText } from "./detect-language";

describe("detectLanguageCodeFromText", () => {
  it("detects Telugu script", () => {
    expect(detectLanguageCodeFromText("ఆపిల్ ఎయిర్‌పాడ్స్ ఎలా ఉన్నాయి")).toBe("te-IN");
  });

  it("falls back to English for latin script", () => {
    expect(detectLanguageCodeFromText("Apple AirPods review")).toBe("en-IN");
  });
});
