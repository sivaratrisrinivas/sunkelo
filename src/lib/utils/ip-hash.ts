import { createHash } from "node:crypto";

export function hashIpFromHeader(headerValue: string | null): string {
  const ip = headerValue?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(ip).digest("hex");
}
