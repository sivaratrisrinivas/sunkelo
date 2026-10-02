# Grounding eval

Question: is each claim in a SunkeLo review summary supported by the scraped source text?

The old check (`bench/gs-t7.ts`, now `bench/overlap-metric.ts`) counts a claim as grounded when the
source has every number in it and 60% of its content words. This folder measures that check and an
LLM judge against labeled claims.

## Data

| File | Rows | How it was made |
|---|---:|---|
| `data/real_claims.jsonl` | 19 | Claims split from the stored GS-T7 summaries, labeled by hand against the stored sources. 13 Pass, 6 Fail. |
| `data/synthetic.jsonl` | 360 | `generate_synthetic.py`: 36 product sources x 10 claim types (verbatim, paraphrase, unit format, Hindi, added fact, contradiction, changed number, overgeneralized, wrong attribution, summary judgment). Label comes from the claim type. |
| `data/label_review.jsonl` | 5 | Label overrides from an audit of all 36 summary-judgment rows and 28 random rows. |
| `data/verdicts.jsonl` | grows | Cached judge verdicts keyed by prompt version, model, source and claim. |

Splits are by source, so no source sits in two splits: train 60 (few-shot examples only), dev 130,
test 170, real 19. Labels were made by the agent and need a human spot check.

## Results so far

Judge: `openai/gpt-oss-120b` on Groq, prompt `grounding-v1`, 4 few-shot examples from train.
Pass is the positive class.

| Split | Checker | n | TPR | TNR |
|---|---|---:|---:|---:|
| real | word overlap | 19 | 0.000 (0/13) | 0.833 (5/6) |
| dev | word overlap | 130 | 0.422 (27/64) | 0.606 (40/66) |
| test | word overlap | 170 | 0.469 (38/81) | 0.607 (54/89) |
| dev | LLM judge | 98 of 130 | 0.918 (45/49) | 0.980 (48/49) |
| test | LLM judge | not run | | |
| real | LLM judge | 7 of 19 | 1.000 (5/5) | 0.500 (1/2) |

Word overlap is near a coin flip on synthetic claims and marks every one of the 13 grounded real
claims as absent. So the GS-T7 "absent-claim rate 0.7586" mostly measures paraphrase, not
hallucination. By hand labels, 6 of the 19 real claims are unsupported.

Dev misses (5): three are unit-format or model-number claims where the label itself is debatable
("model number is 200" from "X200", "5.5 inch screen resolution"), one Hindi paraphrase, one
summary judgment.

## Not done yet, and why

The judge is **not validated** until it runs on test and real. Groq's free tier allows 200,000
tokens per day for this model and each call uses about 1,700 tokens, so about 115 calls a day.
That ran out after 98 dev and 7 real verdicts (7 real is far too few to mean anything). To finish (cached verdicts are reused, nothing is paid twice):

```bash
GROQ_API_KEY=... JUDGE_MAX_TOKENS=600 npx tsx evals/grounding/run-judge.ts --split real --live
GROQ_API_KEY=... JUDGE_MAX_TOKENS=600 npx tsx evals/grounding/run-judge.ts --split dev --live
GROQ_API_KEY=... JUDGE_MAX_TOKENS=600 npx tsx evals/grounding/run-judge.ts --split test --live   # once
```

Then add `test` and `real` entries to `baseline.json`. Do not tune the prompt after looking at test.

New live summaries could not be generated because there is no `SARVAM_API_KEY` here, so the only
real traces are the 19 claims from the stored GS-T7 run.

## CI

`npm run eval:grounding -- --check` runs offline from the cached verdicts. It fails if a label,
claim, prompt version, or judge model changes in a way that drops cached verdicts below
`baseline.json` or pushes TPR or TNR under the floors.

## Monitoring path

Sample about 20 claims a week from production summaries (claim, source snippet, product), label
them by hand, append them to `real_claims.jsonl`, and re-run the judge on the new rows. Track the
judge's estimated unsupported-claim rate with the Rogan-Gladen correction in
`src/lib/eval/grounding-judge.ts`, which adjusts the raw rate for the judge's measured TPR and TNR.
