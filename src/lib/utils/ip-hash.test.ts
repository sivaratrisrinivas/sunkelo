import { describe, expect, it } from "vitest";

import { hashIpFromHeader } from "./ip-hash";

describe("hashIpFromHeader", () => {
  it("returns stable hash for same IP", () => {
    const first = hashIpFromHeader("1.2.3.4");
    const second = hashIpFromHeader("1.2.3.4");
    expect(first).toBe(second);
  });

  it("returns different hashes for different IPs", () => {
    expect(hashIpFromHeader("1.2.3.4")).not.toBe(hashIpFromHeader("5.6.7.8"));
  });

  it("handles missing header", () => {
    expect(hashIpFromHeader(null)).toHaveLength(64);
  });
});
