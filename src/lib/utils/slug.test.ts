import { describe, expect, it } from "vitest";

import { toSlug } from "./slug";

describe("toSlug", () => {
  it("converts Redmi Note 15 Pro+ correctly", () => {
    expect(toSlug("Redmi Note 15 Pro+")).toBe("redmi-note-15-pro-plus");
  });

  it("converts iPhone 16 correctly", () => {
    expect(toSlug("iPhone 16")).toBe("iphone-16");
  });

  it("converts Samsung Galaxy S24 Ultra 256GB correctly", () => {
    expect(toSlug("Samsung Galaxy S24 Ultra 256GB")).toBe(
      "samsung-galaxy-s24-ultra-256gb",
    );
  });

  it("handles non-Latin text safely", () => {
    expect(toSlug("नोकिया 3310")).toBe("न-क-य-3310");
  });
});
