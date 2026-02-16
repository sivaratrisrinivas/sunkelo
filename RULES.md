## Working Rules

- Keep responses terse and concrete. No high-level filler.
- If asked for fixes, implement code first, explain after.
- Before marking Sprint 5 complete, verify strict user-review evidence workflow is present:
  - pipeline gate via `STRICT_REVIEW_EVIDENCE_MODE`
  - configurable thresholds (`STRICT_REVIEW_MIN_ECOMMERCE_SOURCES`, `STRICT_REVIEW_MIN_SIGNAL_HITS`)
  - failure path emits `INSUFFICIENT_USER_REVIEW_EVIDENCE` and blocks synthesis
- Keep plan mode concise; list unresolved questions at the end when any remain.