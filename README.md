# SunkeLo

SunkeLo is a voice-first product review app: you ask about a product in your language, and it returns one combined review as text and spoken audio.

## Who it is for

SunkeLo is for shoppers in India who are more comfortable speaking than reading English or Hindi review pages, including people in smaller cities outside the biggest metros.

The problem it solves: before buying a phone, a book, kitchenware, or similar goods, people watch YouTube and read shopping-site reviews. Most useful review writing is in Hindi or English. If you think in Odia, Tamil, Bengali, or another supported language, that research takes longer than it should.

Open the page without signing in. The intended use is: tap the mic (or type) and get a verdict.

Supported languages: English, Hindi, Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Marathi, Punjabi, and Odia.

## How to try it

Run it on your machine:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Tap the mic and ask something like `Redmi Note 15 kaisa hai?`, or type the product name and submit.

The home page loads with those two commands. A real review needs API keys (listed under Local setup). Without keys, speech-to-text, page fetching, and review writing cannot run.

## What happens when you ask

1. Speech becomes text, and the app detects the language. (You can also type and skip this step.)
2. It identifies the product name.
3. It checks a cache (a saved copy of a recent review) so a repeat question can skip the slow fetch.
4. On a miss, it gathers public pages from YouTube, shopping sites (Amazon, Flipkart, Myntra, Ajio), and 13 review sites.
5. A Sarvam language model writes one combined review from those sources.
6. Translation (Mayura) can pull useful text across languages, then a spoken script is built. Conversational scripts use Gemini 2.0 Flash when `GEMINI_API_KEY` is set. If Gemini is unset, a simpler template script is used instead.
7. Text-to-speech (Bulbul) speaks the summary in the user's language.
8. Progress and the review card stream to the screen as they are ready (SSE: a live progress feed).

**Strict evidence mode is opt-in.** By default the app still writes a summary even when shopping-site review evidence is thin. The default summary is not evidence-gated. Only if you set `STRICT_REVIEW_EVIDENCE_MODE=true` will the app refuse to write a summary when there are not enough shopping-site sources and review-signal hits. See Local setup for the related knobs.

## What the measured numbers mean

These numbers come from one measurement run named GS-T7. They are stored in this README and in `bench/gs-t7-results.json`. They are not shown on the website.

GS-T7 ran at 2026-08-24T22:39:20.607Z against 5 products. Synthesis model is sarvam-105b. Hardware was an Intel Xeon, 8 cores, 15.6 GiB RAM, linux/x64, Node v20.19.2.

`SARVAM_API_KEY`, `FIRECRAWL_API_KEY`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` were set. `GEMINI_API_KEY` was not. All 10 instrument checks passed. Live calls: synthesizeReview=5, scrapeAllSources=2.

**Absent-claim rate 0.7586 (22/29).** The run split each written summary into claims (sentences that carry facts). A claim is counted as absent unless the source text contains every number in that sentence and at least 60% of the content words (overlap threshold 0.6). 22 of 29 claims were absent. A higher rate means more of the summary was not found in the collected sources. This is a grounding check, not a user-satisfaction score, and it does not block the default app summary.

**Cache hit rate 0.5 (5/10).** Cache means a saved review in Redis (a fast key-value store) so a repeat product can skip scraping and rewriting. The workload was 5 products, then the same 5 again. Redis was configured (`redisConfigured=true`). 5 of 10 lookups were hits, all on the second pass. If Redis is unset, this metric is marked failed. The bench does not publish 0 as a hit rate for a missing cache.

**Cost per query (INR) 0.124858704.** This is a list-price estimate from published sarvam-105b token rates, not a billed invoice. 5 synthesize calls. Tokens prompt=9419 cached=640 completion=4921. Rates input ₹29.28 / cached ₹10.98 / output ₹73.2 per 1M tokens. Source: [Sarvam pricing](https://docs.sarvam.ai/api/getting-started/pricing) (INR, fetched 2026-08-25).

**Cost per query (USD):** failed. The sarvam-105b list price is published in INR only. There is no published USD rate, so USD is failed rather than an invented currency conversion.

**Firecrawl-only cost (USD) 0.0384.** This is the scraping vendor's published credit price, not a Sarvam USD price. 2 scrapeAllSources calls. Credits approximated as 3 searches plus 6 scrapes per product = 24 credits at $0.0032/credit Hobby yearly (firecrawl.dev/pricing).

| Metric | Result |
|---|---|
| Absent-claim rate | ok. 0.7586 (22/29 summary claims not grounded in source text, overlap threshold 0.6) |
| Cache hit rate | ok. 0.5 (5/10 hits). redisConfigured=true. |
| Cost per query (INR) | ok. 0.124858704. 5 sarvam-105b synthesize calls. Tokens prompt=9419 cached=640 completion=4921. Rates input ₹29.28 / cached ₹10.98 / output ₹73.2 per 1M tokens. https://docs.sarvam.ai/api/getting-started/pricing (INR, fetched 2026-08-25). |
| Cost per query (USD) | failed. sarvam-105b list price is published in INR only. No published USD rate, so USD is failed rather than an invented FX conversion. |
| Firecrawl-only cost (USD) | ok. 0.0384. Firecrawl-only, not a Sarvam USD price. 2 scrapeAllSources calls. Credits approximated as 3 searches plus 6 scrapes per product = 24 credits at $0.0032/credit Hobby yearly (firecrawl.dev/pricing). |

Re-run with `npm run bench:gs-t7`. Raw JSON is `bench/gs-t7-results.json`.

## Current limitation

- Review writing uses web-scraped public signals, not a dedicated verified-purchaser dataset.
- Authenticity is inferred from domain trust plus textual review cues.
- So output is "real public user-review content where available", not a guaranteed pure user-only corpus.
- Enable strict evidence mode (opt-in, off by default) to block low-evidence synthesis responses.

---

## Local setup

Contributor details from here down. You still need these to run a full review locally.

1. Create `.env.local` and add required keys (see `docs/spec.md` section `7.3 Environment Variables`).
   - `SARVAM_API_KEY`: speech-to-text, translation, spoken audio, and review writing.
   - `FIRECRAWL_API_KEY`: fetching public review pages.
   - `DATABASE_URL`: Neon Postgres (the app database).
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: cache and daily query caps. If Redis is unset, GS-T7 cache status is failed; do not treat a missing cache as a 0% hit rate.
   - `GEMINI_API_KEY`: conversational spoken scripts. If unset, a simpler template script is used.
   - For local stress testing, set `DISABLE_RATE_LIMIT=true` to bypass daily query caps.
   - Optional stricter review quality gate (all off unless you set them):
     - `STRICT_REVIEW_EVIDENCE_MODE=true`
     - `STRICT_REVIEW_MIN_ECOMMERCE_SOURCES=2`
     - `STRICT_REVIEW_MIN_SIGNAL_HITS=2`

2. Install and run:

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

Target latency (design goal, not a GS-T7 measured number): first useful response fast, full audio within ~30s. Architecture style: cache-first to reduce cost and improve repeat-query speed.

## What is built so far

Completed:

- **Sprint 1:** foundation, data layer setup, utilities, project tooling
- **Sprint 2:** voice capture, STT (speech-to-text) integration layer, SSE pipeline foundation, language badge flow
- **Sprint 3:** intent/entity extraction, alias resolution, progress steps UI, non-product rejection UI, and dedicated Sprint 3 test coverage
- **Sprint 4:** Firecrawl client + source scraping/parsing, Mayura translation wrapper/chunking, source normalization pipeline, `/api/sources` endpoint, and Sprint 4 test suite
- **Sprint 5:** review synthesis pipeline, `ReviewCard` + loading skeleton, review persistence, `NO_REVIEWS` UX, and strict user-review evidence mode
- **Sprint 6:** translation + TTS (spoken audio) + audio playback pipeline, `AudioPlayer` component, localized error messages + Gemini-powered conversational audio scripts
- **Sprint 7:** caching layer (review, localized, alias caches), retry with backoff, async query logging, quota badge UI, latency budget test

Planned next:

- Trending, SEO pages, analytics
- Production hardening

Full plan lives in `docs/sprints.md`.
Detailed product spec lives in `docs/spec.md`.

## Tech stack

- `Next.js` + `React` + `TypeScript`
- `Neon Postgres`
- `Upstash Redis`
- `Sarvam AI` (`Saaras`, `sarvam-105b`, `Mayura`, `Bulbul`)
- `Google Gemini` (`2.0 Flash` for conversational audio script generation)
- `Firecrawl`
- `Vitest` + `Playwright`

## End-to-end flow (target)

1. User records voice in browser.
2. `POST /api/query` receives audio.
3. STT transcribes + language detects.
4. Intent/entity extraction identifies the product.
5. Cache lookup checks if review already exists.
6. On miss: scrape sources, normalize, synthesize.
7. Localize summary to user's language.
8. Generate TTS audio.
9. Stream `status -> review -> audio -> done` over SSE.
10. Save results in DB + cache for faster future queries.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

## Repository layout

- `src/app` - routes and API endpoints
- `src/components` - UI building blocks
- `src/hooks` - voice and streaming hooks
- `src/lib` - db/cache/ai/pipeline modules
- `src/types` - shared types
- `scripts` - seed and tooling scripts
- `bench` - GS-T7 measurement script and results JSON
- `docs/spec.md` - product and architecture specification
- `docs/sprints.md` - sprint-by-sprint execution plan
