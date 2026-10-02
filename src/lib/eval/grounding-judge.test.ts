import { describe, expect, it, vi } from "vitest";

import {
  buildJudgeMessages,
  confusion,
  correctedPassRate,
  judgeClaimWithLlm,
  judgeConfigFromEnv,
  parseJudgeOutput,
  rates,
} from "./grounding-judge";

describe("parseJudgeOutput", () => {
  it("reads JSON with critique and result", () => {
    expect(parseJudgeOutput('{"critique": "ok", "result": "Pass"}')).toEqual({ critique: "ok", result: "Pass" });
    expect(parseJudgeOutput('```json\n{"critique": "no", "result": "fail"}\n```')?.result).toBe("Fail");
  });
  it("rejects anything else", () => {
    expect(parseJudgeOutput("Pass")).toBeNull();
    expect(parseJudgeOutput('{"result": "maybe"}')).toBeNull();
    expect(parseJudgeOutput("{not json}")).toBeNull();
  });
});

describe("buildJudgeMessages", () => {
  it("puts few-shot examples in the system prompt and the case in the user turn", () => {
    const msgs = buildJudgeMessages("src text", "a claim", [
      { source: "s1", claim: "c1", critique: "fine", result: "Pass" },
    ]);
    expect(msgs[0].content).toContain("Example 1");
    expect(msgs[1].content).toBe("SOURCE:\nsrc text\nCLAIM: a claim");
  });
});

describe("metrics", () => {
  it("counts Pass as the positive class", () => {
    const c = confusion(["Pass", "Pass", "Fail", "Fail"], ["Pass", "Fail", "Fail", "Pass"]);
    expect(c).toEqual({ tp: 1, fn: 1, tn: 1, fp: 1 });
    expect(rates(c)).toEqual({ tpr: 0.5, tnr: 0.5, accuracy: 0.5 });
  });
  it("corrects an observed pass rate", () => {
    expect(correctedPassRate(0.5, 0.9, 0.9)).toBeCloseTo(0.5);
    expect(correctedPassRate(0.7, 0.9, 0.8)).toBeCloseTo((0.7 + 0.8 - 1) / 0.7);
    expect(correctedPassRate(0.5, 0.5, 0.5)).toBeNull();
  });
});

describe("judgeConfigFromEnv", () => {
  it("is null without a key and defaults to Groq", () => {
    expect(judgeConfigFromEnv({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(judgeConfigFromEnv({ GROQ_API_KEY: "k" } as unknown as NodeJS.ProcessEnv)?.model).toBe("openai/gpt-oss-120b");
  });
});

describe("judgeClaimWithLlm", () => {
  const config = { baseUrl: "https://x.test/v1", apiKey: "k", model: "m", maxTokens: 10 };
  it("retries on 429 and parses the answer", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: '{"critique":"c","result":"Fail"}' } }] })),
      );
    const p = judgeClaimWithLlm("src", "claim", config, [], fetchImpl as unknown as typeof fetch);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ critique: "c", result: "Fail" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
  it("rejects empty input", async () => {
    await expect(judgeClaimWithLlm(" ", "c", config)).rejects.toThrow("non-empty");
  });
});
