# Grounding eval

Question: is each claim in a SunkeLo review summary supported by the scraped source text?

The old check (`bench/gs-t7.ts`, now `bench/overlap-metric.ts`) counts a claim as grounded when the
source has every number in it and 60% of its content words. This folder measures that check and an
LLM judge against labeled claims.

## Data

| File | Rows | How it was made |
|---|---:|---|
| `data/real_claims.jsonl` | 50 | Claims split from sarvam-105b summaries, labeled by hand against the sources. 19 from the stored GS-T7 run (13 Pass, 6 Fail) and 31 from a 2026-10-03 re-run on the same fixture sources (24 Pass, 7 Fail; one claim identical to a GS-T7 claim was dropped). 37 Pass, 13 Fail. |
| `data/synthetic.jsonl` | 360 | `generate_synthetic.py`: 36 product sources x 10 claim types (verbatim, paraphrase, unit format, Hindi, added fact, contradiction, changed number, overgeneralized, wrong attribution, summary judgment). Label comes from the claim type. |
| `data/label_review.jsonl` | 5 | Label overrides from an audit of all 36 summary-judgment rows and 28 random rows. |
| `data/verdicts.jsonl` | grows | Cached judge verdicts keyed by prompt version, model, source and claim. |

Splits are by source, so no source sits in two splits: train 60 (few-shot examples only), dev 130,
test 170, real 50. Labels were made by the agent and need a human spot check.

## Results so far

Prompt `grounding-v1`, 4 few-shot examples from train, same prompt for both judges. Pass is the
positive class. Two judges:

- `gemini-3.5-flash-lite` (Gemini API free tier, OpenAI-compatible endpoint). Run on 2026-10-03:
  dev first, then test once, then real. The prompt was not changed after any of it.
- `openai/gpt-oss-120b` (Groq free tier). The prompt was written against its dev verdicts.

| Split | Checker | n | TPR | TNR |
|---|---|---:|---:|---:|
| real | word overlap | 50 | 0.270 (10/37) | 0.846 (11/13) |
| dev | word overlap | 130 | 0.422 (27/64) | 0.606 (40/66) |
| test | word overlap | 170 | 0.469 (38/81) | 0.607 (54/89) |
| dev | gemini-3.5-flash-lite | 130 | 0.953 (61/64) | 1.000 (66/66) |
| test | gemini-3.5-flash-lite | 170 | 0.963 (78/81) | 0.978 (87/89) |
| real | gemini-3.5-flash-lite | 50 | 1.000 (37/37) | 0.538 (7/13) |
| dev | gpt-oss-120b | 98 of 130 | 0.918 (45/49) | 0.980 (48/49) |
| test | gpt-oss-120b | 3 of 170 | 1.000 (3/3) | n/a |
| real | gpt-oss-120b | 18 of 50 | 1.000 (13/13) | 0.600 (3/5) |

What this says:

- On the held-out synthetic test split the Gemini judge is strong (5 misses of 170). Misses: two
  model-number claims whose label is debatable ("model number is MP-2024", "designated as X 200"),
  two summary judgments, one paraphrase.
- On real summaries it is much weaker at catching unsupported claims: it passed 6 of the 13. All 6
  are small exaggerations or additions inside an otherwise grounded sentence: "more efficient A18
  chip", "camera enhancements", "ads on the home screen", "a common complaint" / "a significant
  concern for many users" (twice, from "some complaints"), and "mid-range" when the source names no
  price tier. The synthetic set has few claims like these, so test TNR overstates real TNR.
- Word overlap is near a coin flip on synthetic claims and misses 27 of 37 supported real claims, so
  the GS-T7 "absent-claim rate" mostly measures paraphrase, not hallucination.
- 13 real Fail labels is a small sample (TNR 0.538 has a wide margin). Several of those labels are
  judgment calls ("a common complaint", "mid-range") and need a human spot check.

## Not done yet, and why

- **gpt-oss-120b on test.** Groq's free tier allows 200,000 tokens per day for this model, about
  115 judge calls. On 2026-10-03 the quota was already used up, and a slow retry loop got 3 test
  verdicts in about 45 minutes. To finish later (cached verdicts are reused, nothing is paid twice):

  ```bash
  GROQ_API_KEY=... JUDGE_MAX_TOKENS=600 npx tsx evals/grounding/run-judge.ts --split test --live   # once
  ```

- **More real claims.** The 2026-10-03 re-run used fixture sources because Firecrawl's free credits
  were used up (0 of 1,000 left, resets 2026-10-23). Live-scraped sources would give longer, messier
  inputs and harder claims.

Re-running the Gemini judge:

```bash
JUDGE_API_KEY=$GEMINI_API_KEY JUDGE_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai \
JUDGE_MODEL=gemini-3.5-flash-lite JUDGE_MAX_TOKENS=600 npx tsx evals/grounding/run-judge.ts --split real --live
```

The free tier allows 15 requests per minute; the judge retries 429s with backoff.

## CI

`npm run eval:grounding -- --check` runs offline from the cached verdicts. It checks two judges: gpt-oss-120b against `baseline.json`, then gemini-3.5-flash-lite against `baseline.gemini-3.5-flash-lite.json` (floors: TPR 0.95 and TNR 0.95 on dev and test, TPR 0.95 and TNR 0.50 on real). It fails if a label,
claim, prompt version, or judge model changes in a way that drops cached verdicts below
`baseline.json` or pushes TPR or TNR under the floors.

## Monitoring path

Sample about 20 claims a week from production summaries (claim, source snippet, product), label
them by hand, append them to `real_claims.jsonl`, and re-run the judge on the new rows. Track the
judge's estimated unsupported-claim rate with the Rogan-Gladen correction in
`src/lib/eval/grounding-judge.ts`, which adjusts the raw rate for the judge's measured TPR and TNR.
