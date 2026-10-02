# Eval audit (eval-audit skill, 2026-10-03)

Routed by evals-start: an eval pipeline exists, so `eval-audit`. Findings by impact.

## 3. Judge validation

### LLM judge is not validated on held-out data
**Status:** Partly fixed on 2026-10-03.
A second judge, `gemini-3.5-flash-lite` (Gemini free tier, same `grounding-v1` prompt, no prompt changes), ran on dev, then test once, then real. Held-out test: TPR 0.963 (78/81), TNR 0.978 (87/89). Real (50 claims): TPR 1.000 (37/37), TNR 0.538 (7/13). The 6 real misses are all small exaggerations inside grounded sentences ("more efficient A18 chip", "camera enhancements", "ads on the home screen", "a common complaint" twice, "mid-range"). So synthetic test TNR overstates how well it catches unsupported claims in real summaries.
The original `gpt-oss-120b` judge is still not validated: 98 of 130 dev, 3 of 170 test, 18 of 50 real. Groq's 200k tokens/day free limit was used up again on 2026-10-03.
**Fix:** CI now gates the Gemini judge's cached verdicts against `baseline.gemini-3.5-flash-lite.json`. Next: add real claims that look like the 6 misses (exaggerated quantifiers, invented tiers) to the synthetic generator, and get a human to check the 13 real Fail labels. Until real TNR improves, do not publish a hallucination rate from this judge alone.

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
**Status:** Improved, still short. 50 real claims (37 Pass, 13 Fail), up from 19. The 31 new claims come from a live `sarvam-105b` re-run of GS-T7 on 2026-10-03. That run used fixture sources because Firecrawl's free credits were used up (0 of 1,000 left until 2026-10-23), so the sources are short. The target is still about 50 Fail claims. The 360 synthetic claims cover 10 observed claim types, but labels follow from the claim type and only 64 were audited by hand (5 overrides).
**Fix:** re-run GS-T7 with live scraping once Firecrawl credits reset, and use the weekly sampling loop in `README.md` ("Monitoring path") once production summaries exist.

## 4. Human review

### Labels are agent-made
**Status:** Problem exists. All labels were written by an AI agent. They need a person who reads the Hindi/English sources to spot-check `real_claims.jsonl` and `label_review.jsonl`.

## 1. Error analysis

**Status:** OK for the size of the data. The claim types (unit format, Hindi paraphrase, wrong attribution, summary judgment, ...) were observed in the 19 real GS-T7 claims, not borrowed from research.

## 6. Pipeline hygiene

**Status:** OK in CI. The offline gate fails when the prompt version, judge model, labels, or claims change in a way that drops cached verdicts or TPR/TNR below the floors. That forces a re-run after changes.
