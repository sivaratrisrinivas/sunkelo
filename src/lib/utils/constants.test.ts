import { describe, expect, it } from "vitest";

import {
  APP_NAME,
  MAX_AUDIO_DURATION_SECONDS,
  QUERY_RATE_LIMIT_PER_DAY,
  SUPPORTED_LANGUAGE_CODES,
} from "./constants";

describe("constants", () => {
  it("exports expected app constants", () => {
    expect(APP_NAME).toBe("SunkeLo");
    expect(QUERY_RATE_LIMIT_PER_DAY).toBe(5);
    expect(MAX_AUDIO_DURATION_SECONDS).toBe(30);
    expect(SUPPORTED_LANGUAGE_CODES).toHaveLength(11);
  });
});
