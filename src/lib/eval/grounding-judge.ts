/**
 * Binary grounding judge: is one summary claim supported by the review source text?
 *
 * One failure mode only (unsupported claims). Validated against labeled data in
 * evals/grounding (see evals/grounding/README.md for TPR/TNR). Talks to any
 * OpenAI-compatible chat endpoint; defaults to Groq.
 */

export type GroundingVerdict = "Pass" | "Fail";

export type GroundingExample = {
  source: string;
  claim: string;
  critique: string;
  result: GroundingVerdict;
};

export type JudgeConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
};

export type JudgeOutput = {
  critique: string;
  result: GroundingVerdict;
};

export const JUDGE_PROMPT_VERSION = "grounding-v1";

const INSTRUCTIONS = `You check one claim from an AI-written product review summary against the review text it was written from.

Decide whether the claim is grounded in the source.

Pass: every fact, number, and opinion in the claim is stated in the source or follows directly from it. These are fine:
- paraphrase or reordering
- a translation (for example into Hindi) that keeps the meaning
- unit or number formatting changes that keep the value (5000mAh vs 5,000 mAh, Rs. 18,999 vs 18999 rupees)
- an overall judgment that the source's own pros and cons clearly support

Fail: the claim says something the source does not support. This includes:
- a fact, spec, feature, or number that is not in the source
- a changed number or unit value
- a contradiction of the source, or flipping a complaint into praise
- overgeneralizing: one reviewer or "some users" becomes "all users", "most users", or "many users", or a minor point becomes a "significant concern for many"
- attributing a view to a person, site, or platform the source does not name (for example "Amazon buyers say" when the source is not from Amazon)
- a judgment on something the source never discusses, such as price, value for money, or ranking against other products ("best-in-class", "a good mid-range option")

Judge only the claim. Do not use outside knowledge about the product: if the source does not say it, it is not grounded even if it is true.

Write a short critique first that names the exact words in the claim that are or are not supported. Then give the result.
Return only JSON: {"critique": "...", "result": "Pass" or "Fail"}`;

export function buildJudgeMessages(
  source: string,
  claim: string,
  examples: GroundingExample[] = [],
): Array<{ role: "system" | "user"; content: string }> {
  const shots = examples
    .map(
      (ex, i) =>
        `Example ${i + 1}\nSOURCE:\n${ex.source}\nCLAIM: ${ex.claim}\n` +
        JSON.stringify({ critique: ex.critique, result: ex.result }),
    )
    .join("\n\n");
  const system = shots ? `${INSTRUCTIONS}\n\n${shots}` : INSTRUCTIONS;
  return [
    { role: "system", content: system },
    { role: "user", content: `SOURCE:\n${source}\nCLAIM: ${claim}` },
  ];
}

export function parseJudgeOutput(text: string): JudgeOutput | null {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) {
    return null;
  }
  try {
    const obj = JSON.parse(match[0]) as { critique?: unknown; result?: unknown };
    const result = typeof obj.result === "string" ? obj.result.trim().toLowerCase() : "";
    if (result !== "pass" && result !== "fail") {
      return null;
    }
    return {
      critique: typeof obj.critique === "string" ? obj.critique : "",
      result: result === "pass" ? "Pass" : "Fail",
    };
  } catch {
    return null;
  }
}

export function judgeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): JudgeConfig | null {
  const apiKey = env.JUDGE_API_KEY || env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }
  return {
    baseUrl: env.JUDGE_BASE_URL || "https://api.groq.com/openai/v1",
    apiKey,
    model: env.JUDGE_MODEL || "openai/gpt-oss-120b",
    maxTokens: Number(env.JUDGE_MAX_TOKENS || 700),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function judgeClaimWithLlm(
  source: string,
  claim: string,
  config: JudgeConfig,
  examples: GroundingExample[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<JudgeOutput> {
  if (!source.trim() || !claim.trim()) {
    throw new Error("source and claim must be non-empty");
  }
  const body: Record<string, unknown> = {
    model: config.model,
    messages: buildJudgeMessages(source, claim, examples),
    temperature: 0,
    max_tokens: config.maxTokens,
  };
  if (config.model.includes("gpt-oss")) {
    body.reasoning_effort = "low";
  }
  let lastError = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let res: Response;
    try {
      res = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      lastError = `network: ${(e as Error).message}`;
      if (process.env.JUDGE_DEBUG) console.error(`judge retry: ${lastError}`);
      await sleep(2000 * 2 ** Math.min(attempt, 4));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = `HTTP ${res.status}`;
      const retryAfter = Number(res.headers.get("retry-after"));
      if (process.env.JUDGE_DEBUG) console.error(`judge retry: ${lastError}, retry-after ${retryAfter}`, (await res.clone().text()).slice(0, 400));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      throw new Error(`judge call failed: HTTP ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = parseJudgeOutput(data.choices?.[0]?.message?.content ?? "");
    if (parsed) {
      return parsed;
    }
    lastError = "unparseable judge output";
    if (process.env.JUDGE_DEBUG) console.error("judge retry: unparseable output");
  }
  throw new Error(`judge call kept failing: ${lastError}`);
}

export type Confusion = { tp: number; fn: number; tn: number; fp: number };

/** Positive class is Pass (claim is grounded), following the validate-evaluator convention. */
export function confusion(labels: GroundingVerdict[], predictions: GroundingVerdict[]): Confusion {
  if (labels.length !== predictions.length) {
    throw new Error("labels and predictions differ in length");
  }
  const c: Confusion = { tp: 0, fn: 0, tn: 0, fp: 0 };
  labels.forEach((label, i) => {
    const pred = predictions[i];
    if (label === "Pass") {
      if (pred === "Pass") c.tp += 1;
      else c.fn += 1;
    } else if (pred === "Fail") c.tn += 1;
    else c.fp += 1;
  });
  return c;
}

export function rates(c: Confusion): { tpr: number | null; tnr: number | null; accuracy: number | null } {
  const pos = c.tp + c.fn;
  const neg = c.tn + c.fp;
  const all = pos + neg;
  return {
    tpr: pos ? c.tp / pos : null,
    tnr: neg ? c.tn / neg : null,
    accuracy: all ? (c.tp + c.tn) / all : null,
  };
}

/** Rogan-Gladen correction: estimate the true pass rate from an observed judge pass rate. */
export function correctedPassRate(observed: number, tpr: number, tnr: number): number | null {
  const denom = tpr + tnr - 1;
  if (denom <= 0) {
    return null;
  }
  return Math.min(1, Math.max(0, (observed + tnr - 1) / denom));
}
