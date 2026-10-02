/**
 * Validate the grounding judge (src/lib/eval/grounding-judge.ts) on labeled claims.
 *
 * Data (evals/grounding/data):
 *   synthetic.jsonl     generated source + claim pairs, labeled by construction
 *   label_review.jsonl  agent review overrides for synthetic labels (optional)
 *   real_claims.jsonl   19 claims from real SunkeLo summaries, hand labeled
 *   verdicts.jsonl      cached judge verdicts, keyed by prompt version + model + text hash
 *
 * Splits: synthetic rows are split by source (train 15%, dev 40%, test 45%) so one
 * source never sits in two splits. Few-shot examples come only from train.
 *
 *   npx tsx evals/grounding/run-judge.ts --split dev --live    # call the judge, fill cache
 *   npx tsx evals/grounding/run-judge.ts --split test --live   # run once, at the end
 *   npx tsx evals/grounding/run-judge.ts --check               # CI: offline, from cache
 *   (--check also gates each judge in EXTRA_JUDGES against its own baseline file)
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { judgeClaim as overlapJudge } from "../../bench/overlap-metric";
import {
  confusion,
  JUDGE_PROMPT_VERSION,
  judgeClaimWithLlm,
  judgeConfigFromEnv,
  rates,
  type GroundingExample,
  type GroundingVerdict,
} from "../../src/lib/eval/grounding-judge";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "data");
const CACHE = join(DATA, "verdicts.jsonl");

export type Row = {
  id: string;
  source_id: string;
  source: string;
  claim: string;
  label: GroundingVerdict;
  relation: string;
  split: "train" | "dev" | "test" | "real";
  note: string;
};

type CachedVerdict = { key: string; id: string; result: GroundingVerdict; critique: string; model: string };

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

export function splitFor(sourceId: string): "train" | "dev" | "test" {
  const h = parseInt(createHash("sha256").update(sourceId).digest("hex").slice(0, 8), 16) % 100;
  if (h < 15) return "train";
  if (h < 55) return "dev";
  return "test";
}

export function loadRows(): Row[] {
  type Synth = {
    id: string;
    source_id: string;
    source: string;
    claim: string;
    label: GroundingVerdict;
    dims: { relation: string };
    generator_note: string;
  };
  type Review = { id: string; label: GroundingVerdict | "drop"; reason: string };
  type Real = { id: string; product: string; source: string; claim: string; label: GroundingVerdict; label_note: string };
  const overrides = new Map(readJsonl<Review>(join(DATA, "label_review.jsonl")).map((r) => [r.id, r]));
  const rows: Row[] = [];
  for (const s of readJsonl<Synth>(join(DATA, "synthetic.jsonl"))) {
    const o = overrides.get(s.id);
    if (o?.label === "drop") continue;
    rows.push({
      id: s.id,
      source_id: s.source_id,
      source: s.source,
      claim: s.claim,
      label: o ? o.label : s.label,
      relation: s.dims.relation,
      split: splitFor(s.source_id),
      note: o ? o.reason : s.generator_note,
    });
  }
  for (const r of readJsonl<Real>(join(DATA, "real_claims.jsonl"))) {
    rows.push({
      id: r.id,
      source_id: r.product,
      source: r.source,
      claim: r.claim,
      label: r.label,
      relation: "real",
      split: "real",
      note: r.label_note,
    });
  }
  return rows;
}

export function fewShot(rows: Row[]): GroundingExample[] {
  // One example each for the hardest relations seen in dev error analysis.
  const wanted: Array<[string, GroundingVerdict]> = [
    ["summary_judgment", "Pass"],
    ["overgeneralized", "Fail"],
    ["paraphrase", "Pass"],
    ["wrong_attribution", "Fail"],
  ];
  const train = rows.filter((r) => r.split === "train");
  const out: GroundingExample[] = [];
  for (const [relation, label] of wanted) {
    const r = train.find((x) => x.relation === relation && x.label === label);
    if (r) out.push({ source: r.source, claim: r.claim, critique: r.note, result: r.label });
  }
  return out;
}

function cacheKey(model: string, row: Row): string {
  return createHash("sha256")
    .update(`${JUDGE_PROMPT_VERSION}\n${model}\n${row.source}\n${row.claim}`)
    .digest("hex")
    .slice(0, 16);
}

function summarize(name: string, labels: GroundingVerdict[], preds: GroundingVerdict[]) {
  const c = confusion(labels, preds);
  const r = rates(c);
  const f = (x: number | null) => (x === null ? "n/a" : x.toFixed(3));
  console.log(
    `  ${name.padEnd(16)} TPR ${f(r.tpr)} (${c.tp}/${c.tp + c.fn})  TNR ${f(r.tnr)} (${c.tn}/${c.tn + c.fp})  acc ${f(r.accuracy)}`,
  );
  return { ...c, ...r };
}

async function main(modelOverride?: string, baselineOverride?: string): Promise<number> {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const check = args.includes("--check");
  const splitArg = args[args.indexOf("--split") + 1];
  const splits = args.includes("--split") ? [splitArg] : ["dev", "test", "real"];
  const model = modelOverride || process.env.JUDGE_MODEL || "openai/gpt-oss-120b";
  const config = judgeConfigFromEnv();
  if (live && !config) {
    console.error("--live needs JUDGE_API_KEY or GROQ_API_KEY");
    return 2;
  }
  const rows = loadRows();
  const examples = fewShot(rows);
  const cache = new Map(readJsonl<CachedVerdict>(CACHE).map((v) => [v.key, v]));
  console.log(
    `rows: ${rows.length} (train ${rows.filter((r) => r.split === "train").length}, ` +
      `dev ${rows.filter((r) => r.split === "dev").length}, test ${rows.filter((r) => r.split === "test").length}, ` +
      `real ${rows.filter((r) => r.split === "real").length}); prompt ${JUDGE_PROMPT_VERSION}, judge ${model}, ${examples.length} few-shot`,
  );
  const report: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const split of splits) {
    const items = rows.filter((r) => r.split === split);
    const labels: GroundingVerdict[] = [];
    const judged: GroundingVerdict[] = [];
    const overlap: GroundingVerdict[] = [];
    const errors: string[] = [];
    let missing = 0;
    for (const row of items) {
      const key = cacheKey(model, row);
      let v = cache.get(key);
      if (!v && live && config) {
        try {
          const out = await judgeClaimWithLlm(row.source, row.claim, { ...config, model }, examples);
          v = { key, id: row.id, result: out.result, critique: out.critique, model };
          appendFileSync(CACHE, JSON.stringify(v) + "\n");
          cache.set(key, v);
          if (cache.size % 10 === 0) console.error(`  ${cache.size} cached verdicts`);
        } catch (e) {
          console.error(`${row.id}: ${(e as Error).message}`);
        }
      }
      if (!v) {
        missing += 1;
        continue;
      }
      labels.push(row.label);
      judged.push(v.result);
      overlap.push(overlapJudge(row.claim, row.source).grounded ? "Pass" : "Fail");
      if (v.result !== row.label) errors.push(`${row.id} [${row.relation}] label ${row.label}: ${row.claim}`);
    }
    console.log(`${split}: ${labels.length} judged, ${missing} without a cached verdict`);
    const overlapAll = summarize(
      `overlap, all ${items.length}`,
      items.map((r) => r.label),
      items.map((r) => (overlapJudge(r.claim, r.source).grounded ? "Pass" : "Fail")),
    );
    const judgeRates = summarize("LLM judge", labels, judged);
    const overlapRates = summarize("word overlap", labels, overlap);
    const byRelation: Record<string, { n: number; judge_correct: number; overlap_correct: number }> = {};
    items.forEach((row) => {
      const v = cache.get(cacheKey(model, row));
      if (!v) return;
      const b = (byRelation[row.relation] ??= { n: 0, judge_correct: 0, overlap_correct: 0 });
      b.n += 1;
      b.judge_correct += Number(v.result === row.label);
      b.overlap_correct += Number((overlapJudge(row.claim, row.source).grounded ? "Pass" : "Fail") === row.label);
    });
    if (split !== "real") {
      console.log(
        "  by relation (judge/overlap correct): " +
          Object.entries(byRelation)
            .sort()
            .map(([k, b]) => `${k} ${b.judge_correct}/${b.overlap_correct} of ${b.n}`)
            .join(", "),
      );
    }
    if (args.includes("--show-errors")) errors.forEach((e) => console.log(`    miss ${e}`));
    report[split] = { n: labels.length, missing, judge: judgeRates, overlap: overlapRates, overlapAll, byRelation };
    if (check) {
      const baselinePath =
        baselineOverride ?? (args.includes("--baseline") ? args[args.indexOf("--baseline") + 1] : join(HERE, "baseline.json"));
      const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Record<
        string,
        { n: number; tpr: number; tnr: number }
      >;
      const b = baseline[split];
      if (b) {
        if (labels.length < b.n) problems.push(`${split}: only ${labels.length} cached verdicts, baseline has ${b.n}`);
        if ((judgeRates.tpr ?? 0) < b.tpr) problems.push(`${split} TPR ${judgeRates.tpr} < ${b.tpr}`);
        if ((judgeRates.tnr ?? 0) < b.tnr) problems.push(`${split} TNR ${judgeRates.tnr} < ${b.tnr}`);
      }
    }
  }
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 1));
  if (check) {
    if (problems.length) {
      console.log(`REGRESSION: ${problems.join("; ")}`);
      return 1;
    }
    console.log("grounding judge gates pass");
  }
  return 0;
}

/** Extra judges gated by `--check`: baseline.<model>.json next to baseline.json. */
export const EXTRA_JUDGES: Record<string, string> = {
  "gemini-3.5-flash-lite": join(HERE, "baseline.gemini-3.5-flash-lite.json"),
};

async function cli(): Promise<number> {
  let code = await main();
  const args = process.argv.slice(2);
  if (args.includes("--check") && !process.env.JUDGE_MODEL && !args.includes("--baseline")) {
    for (const [model, baseline] of Object.entries(EXTRA_JUDGES)) {
      console.log(`\n--- second judge: ${model} ---`);
      code = Math.max(code, await main(model, baseline));
    }
  }
  return code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  cli().then((code) => process.exit(code));
}
