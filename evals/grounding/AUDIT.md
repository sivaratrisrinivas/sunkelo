# Eval audit (eval-audit skill, 2026-10-03)

Routed by evals-start: an eval pipeline exists, so `eval-audit`. Findings by impact.

## 3. Judge validation

### LLM judge is not validated on held-out data
**Status:** Problem exists (not fixed, blocked).
The judge has TPR 0.918 / TNR 0.980 on 98 of 130 dev claims, 7 of 19 real claims, and 0 of 170 test claims. Dev was where the prompt was written, so these numbers are optimistic. A retry on 2026-10-03 hit Groq's 200k tokens/day limit for `gpt-oss-120b` again.
**Fix:** run the three commands in `README.md` ("Not done yet") when quota allows, add `test` and `real` to `baseline.json`, and do not edit the prompt after seeing test. Until then, do not use the judge's numbers for product claims.

### Few-shot leakage
**Status:** OK. The 4 few-shot examples come from the train split. Splits are by source, so no source appears in two splits.

### Metric choice
**Status:** OK. TPR/TNR are reported, plus the Rogan-Gladen correction. Accuracy is only shown next to them.

## 2. Evaluator design

### Similarity metric used as the main grounding evaluator
**Status:** Problem exists in the old GS-T7 benchmark (now measured, not the gate).
`bench/overlap-metric.ts` is word overlap. It scores TPR 0.000 on the 13 grounded real claims, so the published 0.7586 absent-claim rate mostly measures paraphrase.
**Fix done:** the README says so. Use the binary judge once it is validated. Code checks still fit the objective parts (numbers present in source).

### Binary, failure-specific judge
**Status:** OK. One failure mode (claim not supported by source), Pass/Fail with a critique.

## 5. Labeled data

### Too few real labeled claims
**Status:** Problem exists. 19 real claims (13 Pass, 6 Fail). The target is about 50 of each.
Generating more real summaries needs `SARVAM_API_KEY`, which is not available here. The 360 synthetic claims cover 10 observed claim types, but labels follow from the claim type and only 64 were audited by hand (5 overrides).
**Fix:** use the weekly sampling loop in `README.md` ("Monitoring path") once production summaries exist.

## 4. Human review

### Labels are agent-made
**Status:** Problem exists. All labels were written by an AI agent. They need a person who reads the Hindi/English sources to spot-check `real_claims.jsonl` and `label_review.jsonl`.

## 1. Error analysis

**Status:** OK for the size of the data. The claim types (unit format, Hindi paraphrase, wrong attribution, summary judgment, ...) were observed in the 19 real GS-T7 claims, not borrowed from research.

## 6. Pipeline hygiene

**Status:** OK in CI. The offline gate fails when the prompt version, judge model, labels, or claims change in a way that drops cached verdicts or TPR/TNR below the floors. That forces a re-run after changes.
