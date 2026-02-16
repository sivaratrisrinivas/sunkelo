import { describe, expect, it } from "vitest";

import { createSSEStream } from "./orchestrator";

describe("createSSEStream", () => {
  it("emits ordered events in SSE format", async () => {
    const stream = createSSEStream((emitEvent) => {
      emitEvent("status", { step: "listening" });
      emitEvent("done", { cached: false });
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let output = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }

    expect(output).toContain("event: status");
    expect(output).toContain("event: done");
  });
});
