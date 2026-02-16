# SunkeLo — Sprint Plan & Task Breakdown

> Derived from [spec.md](./spec.md). Every task is atomic, commitable, and testable. Every sprint produces a demoable artifact.

---

## Implementation Status

| Sprint | Status | Notes |
|---|---|---|
| Sprint 1 | ✅ Done | Foundation, tooling, DB/cache layer, shared types, landing shell |
| Sprint 2 | ✅ Done | Voice capture, STT wrapper, SSE flow, API query route, language badge |
| Sprint 3 | ✅ Done | Intent/entity extraction, alias resolution, progress steps, non-product UI, Sprint 3 test suite |
| Sprint 4 | ✅ Done | Firecrawl client/scraper/parsers, Mayura translation wrapper/chunking, source normalization, `/api/sources`, optional contract smoke test, any-product intent support, explicit done-state UI |
| Sprint 5-10 | ⏳ Pending | Planned and tracked below |

---

## Sprint 1: Project Foundation & Data Layer

**Status:** ✅ Done

**Sprint Goal:** Running Next.js app with DB + Redis connected, schema deployed, utility functions tested, basic landing page shell.

**Demo:** Visit localhost → see "SunkeLo" landing page shell. DB and Redis connections verified via health check.

| ID | Task | Test / Validation |
|---|---|---|
| 1.1 | Initialize Next.js 15 project with TypeScript, Tailwind CSS v4, App Router | `npm run dev` serves on localhost, `npm run build` succeeds with zero errors |
| 1.2 | Configure ESLint, Prettier, Vitest, Playwright | `npm run lint` passes, `npm run test` runs (empty suite), `npx playwright test` scaffold works |
| 1.3 | Create `.env.example` with all required env vars, add `.env.local` to `.gitignore` | `.env.example` documents every variable from spec section 7.3, `.gitignore` includes `.env.local` |
| 1.4 | Set up Neon Postgres client (`src/lib/db/client.ts`) using `@neondatabase/serverless` | Integration test: connect → `SELECT 1` → returns `{rows: [{?column?: 1}]}` → disconnect |
| 1.5 | Write and execute DDL (`src/lib/db/schema.sql`) for `products`, `reviews`, `review_translations`, `query_logs` | Integration test: query `information_schema.columns` for each table, assert column names, types, constraints, and indexes match spec section 3.1 |
| 1.6 | Implement product queries (`src/lib/db/products.ts`) — `createProduct`, `getBySlug`, `listTrending`, `setTrending` | Integration test: insert product → `getBySlug` returns it → `setTrending(true)` → `listTrending` includes it |
| 1.7 | Implement review queries (`src/lib/db/reviews.ts`) — `createReview`, `getByProductId`, `getWithTranslations` | Integration test: insert product + review → `getByProductId` returns it → add translation → `getWithTranslations` joins correctly |
| 1.8 | Implement query log insert (`src/lib/db/query-logs.ts`) — `insertLog` (async, fire-and-forget) | Integration test: `insertLog` resolves without blocking, row exists in DB with correct fields |
| 1.9 | Set up Upstash Redis client (`src/lib/cache/client.ts`) using `@upstash/redis` | Integration test: `SET key value` → `GET key` returns value → `DEL key` → `GET key` returns null |
| 1.10 | Create shared TypeScript types (`src/types/`) — `product.ts`, `review.ts`, `pipeline.ts`, `api.ts` | `tsc --noEmit` passes, types importable in a dummy test file |
| 1.11 | Implement `src/lib/utils/slug.ts` — product name → URL-safe slug | Unit tests: `"Redmi Note 15 Pro+"` → `"redmi-note-15-pro-plus"`, `"iPhone 16"` → `"iphone-16"`, `"Samsung Galaxy S24 Ultra 256GB"` → `"samsung-galaxy-s24-ultra-256gb"`, handles Devanagari/non-Latin gracefully |
| 1.12 | Implement `src/lib/utils/languages.ts` — BCP-47 code maps, display names, script labels | Unit tests: `getDisplayName("hi-IN")` → `"Hindi"`, `getScript("od-IN")` → `"ଓଡ଼ିଆ"`, all 11 supported languages covered |
| 1.13 | Implement `src/lib/utils/constants.ts` — rate limit, TTLs, supported languages list, max audio duration | Validation: constants importable, values match spec |
| 1.14 | Create root `layout.tsx` — Noto Sans font (Indic support), metadata, viewport config | `npm run dev` → page renders with correct font loaded, `<title>` and meta tags visible in DevTools |
| 1.15 | Create minimal landing page shell (`page.tsx`) — centered "SunkeLo" title + subtitle in 3 scripts + placeholder mic button | Playwright: visit `/` → title visible, subtitle visible, placeholder button rendered, passes mobile viewport (360px) |
| 1.16 | Seed script (`scripts/seed-products.ts`) — insert 50 popular phones into products table with brand, model, slug, price range, `is_trending=true` for top 10 | Run script → 50 rows in `products`, `listTrending` returns 10 items |

---

## Sprint 2: Voice Capture, STT & SSE Foundation

**Status:** ✅ Done

**Sprint Goal:** User taps mic (or types), records voice, audio uploaded to API, transcript + detected language streamed back via SSE.

**Demo:** Open app → tap mic → speak → see real-time "Listening..." → "Got it: [transcript]" with language badge. Alternatively, type a product name and submit.

| ID | Task | Test / Validation |
|---|---|---|
| 2.1 | Implement `useVoiceRecorder` hook (`src/hooks/use-voice-recorder.ts`) — MediaRecorder API, request `audio/webm;codecs=opus` MIME type, auto-stop on 5s silence via `AnalyserNode`, hard stop at 30s, max 10MB blob validation | Unit test (jsdom + mock): hook starts/stops recording, returns Blob, auto-stops after silence, hard-stops at 30s, rejects >10MB blob |
| 2.2 | **Spike:** Validate Sarvam STT accepts WebM/Opus audio — if not, add client-side conversion to WAV via `AudioContext.decodeAudioData` + WAV encoder | Validation: send WebM audio to Sarvam STT endpoint, get valid transcript back. If fails: conversion function test with before/after |
| 2.3 | Build `VoiceInput` component (`src/components/voice-input.tsx`) — mic button (idle/recording/processing states), pulse animation during recording, waveform visualization | Playwright: button visible, click → recording state class applied, aria-label updates ("Tap to record" → "Recording... tap to stop") |
| 2.4 | Handle microphone permission denial — inline error message + reveal text input field as fallback | Playwright: mock `getUserMedia` rejection → error message "Mic access required" appears, text input field visible |
| 2.5 | Implement text input fallback — text field below mic, user types product name, submits to same pipeline (skip STT step) | Playwright: type "Redmi Note 15" → submit → request sent to API with `{text: "Redmi Note 15"}` instead of audio |
| 2.6 | Create Sarvam AI client singleton (`src/lib/sarvam/client.ts`) — API key from env, base URL, shared headers, 30s timeout, basic error handler (catch 500/503 → throw typed `SarvamError`) | Unit test: client instantiates with valid key, throws `ConfigError` if key missing, throws `SarvamError` on 500 response |
| 2.7 | Implement STT wrapper (`src/lib/sarvam/stt.ts`) — accepts audio `Buffer`, calls `/speech-to-text` with `model=saaras:v3`, `language_code=unknown`, returns `{transcript, languageCode, languageProbability}` | Integration test (MSW): valid audio → structured response parsed. Empty transcript → throws `STTError`. 500 → throws `SarvamError`. |
| 2.8 | Define Zod schemas for STT request/response (`src/lib/sarvam/types.ts`) | Unit test: valid STT response parses, missing `transcript` fails, `language_probability` out of range fails |
| 2.9 | Implement SSE stream helper (`src/lib/pipeline/orchestrator.ts` — `createSSEStream`) — creates `ReadableStream` that emits typed events (`status`, `review`, `audio`, `error`, `done`), helper `emitEvent(type, data)` | Unit test: stream emits correctly formatted SSE (`event: status\ndata: {...}\n\n`), multiple events emitted in order, stream closes cleanly |
| 2.10 | Implement basic rate limiter (`src/lib/cache/rate-limit.ts`) — `checkRateLimit(ipHash)` returns `{allowed, remaining, resetAt}`, Redis `INCR` with 24h TTL | Unit test: first 5 calls → `allowed=true` with decreasing `remaining`. 6th call → `allowed=false`, `remaining=0` |
| 2.11 | Implement IP hash utility (`src/lib/utils/ip-hash.ts`) — SHA-256 hash of client IP from `X-Forwarded-For` header | Unit test: same IP → same hash, different IPs → different hashes, missing header → fallback to `"unknown"` |
| 2.12 | Create `POST /api/query` route (`src/app/api/query/route.ts`) — accept `multipart/form-data` (audio field) OR JSON `{text}`, validate input (reject >10MB, reject empty), check rate limit, call STT (or skip if text input), return SSE stream with `status(listening)` → `status(understood, {transcript, language})` → `done` | Integration test: POST audio → SSE stream with 3 events in order. POST `{text}` → SSE skips STT, emits understood directly. POST >10MB → 400. Rate-limited request → SSE `error(RATE_LIMITED)`. |
| 2.13 | Build `LanguageBadge` component (`src/components/language-badge.tsx`) — pill showing detected language display name + script | Unit test: `"hi-IN"` → renders "Hindi · हिन्दी", `"od-IN"` → "Odia · ଓଡ଼ିଆ" |
| 2.14 | Implement `useSSEQuery` hook (`src/hooks/use-sse-query.ts`) — wraps `fetch` + `ReadableStream` reader, parses SSE events, manages state (`idle`/`streaming`/`complete`/`error`), fires typed callbacks | Unit test: hook connects to mock SSE, receives `status` → `done` events, updates state correctly, handles connection errors |
| 2.15 | Wire VoiceInput → API → SSE display — on recording stop (or text submit), POST to `/api/query`, show real-time progress ("Listening..." → "Got it: [transcript]"), display LanguageBadge | Playwright E2E: mock `/api/query` SSE response → recording → transcript text + language badge appear on page |

---

## Sprint 3: Intent Classification & Entity Extraction

**Status:** ✅ Done

**Sprint Goal:** Voice query parsed into structured product entity. Non-product queries rejected. Product slug resolved.

**Demo:** Speak "Redmi Note 15 kaisa hai?" → see "Got it: Redmi Note 15" with entity card. Speak "weather kya hai?" → see friendly rejection message.

| ID | Task | Test / Validation |
|---|---|---|
| 3.1 | Implement Sarvam-M chat completions wrapper (`src/lib/sarvam/chat.ts`) — accepts messages array, model, temperature, returns parsed content. Handles 429/500/503 errors. | Integration test (MSW): send messages → receive completion. 429 → throws `RateLimitError`. 500 → throws `SarvamError`. |
| 3.2 | Define Zod schemas for chat completion request/response | Unit test: valid response parses (with/without `reasoning_content`), invalid `finish_reason` fails |
| 3.3 | Implement combined intent + entity extractor (`src/lib/pipeline/entity.ts`) — single Sarvam-M call with system prompt that returns `{intent, brand, model, variant}`. Post-process: normalize to slug, handle null variant. | Unit tests (mocked chat): `"Redmi Note 15 kaisa hai?"` → `{intent:"product_review", brand:"Redmi", model:"Note 15", slug:"redmi-note-15"}`. `"weather kya hai?"` → `{intent:"unsupported"}`. `"iPhone 16 Pro Max review"` → `{brand:"Apple", model:"iPhone 16 Pro Max", slug:"iphone-16-pro-max"}` |
| 3.4 | Implement product alias resolution — check Redis `product:alias:{normalized}` → canonical slug. If no alias, check Postgres `products.slug`. Fallback to extracted slug. | Unit test: alias `"note 15"` → resolves to `"redmi-note-15"` (Redis hit). Unknown alias → Postgres match. No match → use extracted slug as-is. |
| 3.5 | Seed product aliases into Redis (`scripts/seed-products.ts` update) — for each seeded product, add 2-3 common aliases | Validation: Redis `GET product:alias:note-15` → `"redmi-note-15"`, `GET product:alias:s24` → `"samsung-galaxy-s24"` |
| 3.6 | Update `POST /api/query` pipeline — after STT: run entity extraction → if `unsupported`, emit `error(NOT_A_PRODUCT)` + close stream. If `product_review`, resolve alias, emit `status(searching, {product})` | Integration test: product query → SSE includes `status(understood)` → `status(searching, {product: "Redmi Note 15"})`. Non-product query → SSE includes `error(NOT_A_PRODUCT)`. |
| 3.7 | Build `ProgressSteps` component (`src/components/progress-steps.tsx`) — vertical stepper: Listening ✓ → Understood ✓ → Searching → Analyzing → Done. Active step pulses, completed steps show checkmark. | Unit test: step="searching" → first 2 steps checked, 3rd active, 4th/5th pending. All ARIA roles correct. |
| 3.8 | Update landing page — replace placeholder progress with ProgressSteps, show extracted product name in "Understood" step | Playwright E2E: submit voice → ProgressSteps appears, "Got it: Redmi Note 15" shown in understood step |
| 3.9 | Implement non-product error UI — friendly message in detected language + example query chips | Playwright E2E: trigger unsupported intent → error card with message + query chip suggestions visible |

---

## Sprint 4: Scraping & Content Pipeline

**Status:** ✅ Done

**Sprint Goal:** Given a product name, scrape reviews from blogs + e-commerce + YouTube, normalize all sources to English.

**Demo:** API endpoint accepts product slug → returns array of scraped, parsed, English-normalized review sources with metadata.

| ID | Task | Test / Validation |
|---|---|---|
| 4.1 | Create Firecrawl client (`src/lib/firecrawl/client.ts`) — initialize with API key, expose `search(query, options)` and `scrape(url, options)` methods | Unit test: client instantiates with key, throws `ConfigError` if key missing |
| 4.2 | Implement blog search + scrape (`src/lib/firecrawl/scraper.ts` — `searchBlogs`) — Firecrawl search for `"{product} review"` on GSMArena, 91Mobiles, Smartprix; scrape top 3 results as markdown | Integration test (MSW): mocked search returns 3 URLs → scrape returns markdown content for each. Handles 0 results gracefully. |
| 4.3 | Implement e-commerce search + scrape (`scraper.ts` — `searchEcommerce`) — search Amazon.in + Flipkart for product, scrape review sections | Integration test (MSW): mocked search → scrape returns review snippets. Handles products with no reviews. |
| 4.4 | Implement YouTube transcript search + scrape (`scraper.ts` — `searchYouTube`) — search YouTube for `"{product} review"`, scrape top 3 video pages for transcript content | Integration test (MSW): mocked search → scrape returns transcript text. Handles videos without transcripts. |
| 4.5 | Implement scrape orchestrator (`scraper.ts` — `scrapeAllSources`) — run blog + ecom + YT in parallel via `Promise.allSettled`, merge results, tag each source with `{url, title, type, content}` | Unit test: orchestrator calls all 3, merges results. 1 source fails → others still returned. All fail → returns empty array. |
| 4.6 | Implement content parsers (`src/lib/firecrawl/parsers.ts`) — extract clean review text from raw scraped markdown, strip nav/ads/boilerplate, truncate to 2000 chars per source | Unit test: raw GSMArena markdown → clean review text. Raw Flipkart markdown → extracted user reviews. Truncation works at sentence boundary. |
| 4.7 | Implement Mayura translation wrapper (`src/lib/sarvam/translate.ts`) — accepts input text, source lang, target lang, model `mayura:v1`, returns translated text | Integration test (MSW): `"यह फोन बहुत अच्छा है"` (hi-IN → en-IN) → English translation returned |
| 4.8 | Define Zod schemas for translation request/response | Unit test: valid response parses, empty translation string fails |
| 4.9 | Implement translation chunking utility (`src/lib/sarvam/translate.ts` — `translateLong`) — split text >1000 chars at sentence boundaries, translate chunks in parallel, reassemble | Unit test: 2500-char text → split into 3 chunks at sentence boundaries → each chunk <1000 chars → translated → reassembled in order |
| 4.10 | Implement source normalization (`src/lib/pipeline/normalize-sources.ts`) — detect language of each scraped source (heuristic: non-ASCII → likely Indic), translate non-English sources to English via Mayura, return uniform English corpus | Unit test (mocked translate): 3 sources (1 English, 1 Hindi, 1 Tamil) → all returned in English. Already-English source → no translate call. |
| 4.11 | Add contract smoke test for Firecrawl — optional CI test that hits real Firecrawl API with `"iPhone 15 review"`, validates response shape matches expected schema | Integration test (real API, marked optional): search returns URLs array, scrape returns markdown string. Skipped in normal CI. |

---

## Sprint 5: Review Synthesis & Review Card

**Sprint Goal:** Full text review generated from scraped sources. Structured review card displayed on screen.

**Demo:** Speak "Redmi Note 15 kaisa hai?" → see full review card with verdict badge, pros, cons, best-for, confidence score, source links.

| ID | Task | Test / Validation |
|---|---|---|
| 5.1 | Implement review synthesis prompt builder (`src/lib/pipeline/synthesize.ts`) — constructs Sarvam-M system prompt + user prompt with all sources, calls chat, parses structured JSON response | Unit test (mocked chat): given 3 normalized sources → returns `{verdict, pros, cons, bestFor, summary, tldr, confidenceScore, sources}` |
| 5.2 | Define Zod schema for synthesized review — verdict is `"buy"|"skip"|"wait"`, pros/cons are `string[]` (1-5 items), `confidenceScore` is 0.0-1.0, summary is 100-2000 chars, tldr is 30-500 chars | Unit test: valid review passes. Missing pros → fails. Score 1.5 → fails. Empty summary → fails. |
| 5.3 | Build `ReviewCard` component (`src/components/review-card.tsx`) — verdict badge (Buy=green, Skip=red, Wait=amber), confidence meter, pros list (checkmark icon), cons list (x icon), best-for one-liner, source links (external) | Unit test: renders all fields. Verdict `"buy"` → green badge. 3 pros → 3 list items with checkmarks. Sources render as links with `target="_blank"`. |
| 5.4 | Build `ReviewCard` skeleton/loading state — shimmer placeholders matching layout of final card | Unit test: `<ReviewCard loading />` renders skeleton elements (no real data rendered), accessible role="status" |
| 5.5 | Update `POST /api/query` pipeline — after entity extraction + cache miss: scrape → normalize → synthesize → emit `status(analyzing)` → emit `review(data)` → emit `done` | Integration test (all mocked): full pipeline SSE emits events in order: `status(listening)` → `status(understood)` → `status(searching)` → `status(analyzing)` → `review({...})` → `done({cached:false})` |
| 5.6 | Implement Postgres persistence in pipeline — after synthesis: upsert product (if new slug), insert review row, link to product FK | Integration test: pipeline runs → `products` row exists with correct slug, `reviews` row exists with correct `product_id` FK |
| 5.7 | Wire review SSE event to UI — when `review` event arrives, transition from skeleton to filled ReviewCard, scroll into view | Playwright E2E: submit query → skeleton appears during `analyzing` step → review card populates with verdict, pros, cons |
| 5.8 | Implement error UI for `NO_REVIEWS` — when scraper returns <2 sources, emit `error(NO_REVIEWS)` with trending product suggestions | Playwright E2E: mock scraper returns 0 results → error card with "Not enough reviews" + trending suggestions |

---

## Sprint 6: Translation, TTS & Audio Playback

**Sprint Goal:** Full localization pipeline. Review delivered in user's detected language as text + playable audio.

**Demo:** Speak in Odia → get review card in Odia + tap play button → hear TL;DR audio summary in Odia.

| ID | Task | Test / Validation |
|---|---|---|
| 6.1 | Implement TTS wrapper (`src/lib/sarvam/tts.ts`) — accepts text + language code + speaker voice, calls Bulbul v3 `/text-to-speech`, returns audio `Buffer` (WAV) | Integration test (MSW): text + `hi-IN` → audio buffer returned with valid WAV header bytes |
| 6.2 | Define Zod schemas for TTS request validation | Unit test: valid request passes, text >1000 chars fails, unsupported language code fails |
| 6.3 | Set up audio file storage — Vercel Blob (`@vercel/blob`) for storing generated TTS audio files, returns public URL | Integration test: upload buffer → receive URL → URL is accessible (HEAD request 200) |
| 6.4 | Implement localization pipeline (`src/lib/pipeline/localize.ts`) — if user lang ≠ `en-IN`: translate summary + tldr via `translateLong`; generate TTS from translated tldr; store audio via Vercel Blob; return localized review + audio URL | Unit test (mocked): English review + detected `od-IN` → Odia summary + Odia tldr + audio URL. English query → no translate call, TTS from English tldr. |
| 6.5 | Implement `review_translations` DB persistence — store translated text + audio URL per `(review_id, language_code)` | Integration test: localize pipeline → `review_translations` row exists with correct FK, language code, translated text, audio URL |
| 6.6 | Implement `useAudioPlayer` hook (`src/hooks/use-audio-player.ts`) — manages `HTMLAudioElement`, play/pause toggle, current time, duration, loading state, error handling | Unit test: hook creates audio element, `play()` → `isPlaying=true`, `pause()` → `isPlaying=false`, `onEnded` → `isPlaying=false` |
| 6.7 | Build `AudioPlayer` component (`src/components/audio-player.tsx`) — play/pause button (large, touch-friendly), progress bar, elapsed/total time, loading spinner while audio loads | Unit test: renders play button, click → toggles to pause icon. Loading state → spinner visible. Duration formatted as `"0:35"`. |
| 6.8 | Update pipeline orchestrator — add localize step after synthesis, emit `audio({audioUrl, durationSeconds})` SSE event | Integration test: full pipeline with non-English query → SSE includes `review` (localized text) + `audio` (URL) events |
| 6.9 | Wire audio event to UI — when `audio` SSE event arrives, render AudioPlayer below ReviewCard | Playwright E2E: full query → review card renders → audio player appears below with play button |
| 6.10 | Handle English-only path — if detected language is `en-IN`, skip Mayura translation, generate TTS directly from English tldr | Integration test: `en-IN` query → zero translate calls, one TTS call, audio URL returned |
| 6.11 | Implement localized error messages — translate error messages (NOT_A_PRODUCT, STT_FAILED, etc.) to detected language via Sarvam-M chat | Unit test (mocked): detected `hi-IN` + error `NOT_A_PRODUCT` → Hindi error message returned |

---

## Sprint 7: Caching Layer & Performance

**Sprint Goal:** Cached responses served in <8s. Second query for same product skips scraping entirely. Localized caches per language.

**Demo:** First query: full 20s pipeline. Second identical query: ~5s cached response. Same product in different language: translation cached.

| ID | Task | Test / Validation |
|---|---|---|
| 7.1 | Implement review cache (`src/lib/cache/reviews.ts`) — `getCachedReview(slug)`, `setCachedReview(slug, data, ttlDays)`, `getCachedLocalized(slug, lang)`, `setCachedLocalized(slug, lang, data, ttlDays)` | Unit test: `set` → `get` returns data. TTL correctly passed. Non-existent key → returns `null`. |
| 7.2 | Implement product alias cache set/get (`src/lib/cache/reviews.ts`) — `getAlias(alias)`, `setAlias(alias, canonicalSlug)` | Unit test: `setAlias("note 15", "redmi-note-15")` → `getAlias("note 15")` returns `"redmi-note-15"` |
| 7.3 | Integrate review cache into pipeline — after entity extraction, check `getCachedReview(slug)`. On **hit**: skip scrape + synthesize, jump to localize. Emit `status(searching)` with `"(cached)"`. | Integration test: first query → cache miss → full pipeline. Same query → cache hit → no Firecrawl/Sarvam-M synthesis calls. |
| 7.4 | Integrate localized cache into pipeline — after localization, `setCachedLocalized`. On subsequent same-slug+same-lang query, skip translate + TTS. | Integration test: first Odia query → translate + TTS called. Second Odia query → `getCachedLocalized` hit → no translate/TTS calls. |
| 7.5 | Add `cached: true|false` to SSE `done` event | Integration test: uncached → `done({cached:false})`. Cached → `done({cached:true})`. |
| 7.6 | Wire remaining-quota display to UI — show `"X/5 queries left today"` badge in header after each query, read from rate-limit response | Playwright E2E: make 2 queries → badge shows `"3/5 left"`. After 5 → badge shows `"0/5 left"`. |
| 7.7 | Implement Sarvam API retry with exponential backoff — on 500/503, retry once after 2s. If still failing, throw `ServiceUnavailableError`. | Integration test (MSW): first call 500, retry returns 200 → success. Both fail → `ServiceUnavailableError` thrown. |
| 7.8 | Add `SERVICE_UNAVAILABLE` error path in pipeline — catch `ServiceUnavailableError`, emit `error(SERVICE_UNAVAILABLE)` SSE event | Integration test: Sarvam 500x2 → SSE includes `error({code:"SERVICE_UNAVAILABLE"})` |
| 7.9 | Implement async query logging — `insertLog` called after pipeline completion (non-blocking), logs ip_hash, transcript, language, intent, product_id, cache_hit, latency_ms | Integration test: pipeline completes → `query_logs` row exists with all fields, pipeline latency unaffected by slow DB write |
| 7.10 | Latency budget integration test — mock all external APIs with realistic delays (STT 2s, scrape 5s, synthesis 3s, translate 1s, TTS 2s). Assert total pipeline < 30s, first SSE event < 3s. | Integration test: pipeline with delayed mocks completes within budget. First `status(listening)` event emitted < 3s after request. |

---

## Sprint 8: Trending, Landing Page & Pre-indexing

**Sprint Goal:** Full landing page with trending products, example chips, pre-indexing cron. Production-quality first impression.

**Demo:** Landing page loads with trending phone grid, example query chips. Click a trending phone → pre-cached review loads instantly.

| ID | Task | Test / Validation |
|---|---|---|
| 8.1 | Implement `GET /api/trending` route — fetch from Redis `trending:products` (1h TTL), fallback to Postgres `listTrending`, return product list with latest verdict | Integration test: Redis has data → returns from cache. Redis empty → queries Postgres → populates Redis → returns. |
| 8.2 | Build `QueryChips` component (`src/components/query-chips.tsx`) — horizontally scrollable chips with example queries in multiple languages ("Redmi Note 15 kaisa hai?", "Best phone under 20K?", "Samsung vs iPhone?"). Tap → submit to pipeline. | Unit test: renders all chips. Click fires `onSelect(chipText)`. Horizontal scroll on overflow. |
| 8.3 | Build `TrendingGrid` component (`src/components/trending-grid.tsx`) — responsive card grid: product image placeholder, name, price range, verdict badge. Tap card → initiate query for that product (via text input path). | Unit test: renders N cards for N products. Verdict `"buy"` → green badge. Click fires `onProductSelect(slug)`. |
| 8.4 | Assemble full landing page — giant pulsing mic button (centered, prominent), subtitle in 3 scripts ("कोई भी फोन पूछो · ಯಾವುದೇ ಫೋನ್ ಕೇಳಿ · যেকোনো ফোন জিজ্ঞাসা করুন"), QueryChips below mic, TrendingGrid at bottom | Playwright E2E: all sections visible. Mobile (360px): mic button centered, chips scrollable, grid single-column. Desktop: grid 3-column. |
| 8.5 | Implement pre-index cron route (`src/app/api/cron/pre-index/route.ts`) — verify `CRON_SECRET` auth, iterate trending products, run scrape+synthesize+cache for each (skip if cache fresh), populate `trending:products` Redis key, return `{indexed, skipped, errors}` | Integration test (mocked): 3 trending products → 2 indexed (cache stale), 1 skipped (cache fresh), `trending:products` key set |
| 8.6 | Add `CRON_SECRET` auth guard to cron route — verify `Authorization: Bearer {CRON_SECRET}` header | Integration test: valid secret → 200. Wrong secret → 401. Missing header → 401. |
| 8.7 | Configure `vercel.json` cron — schedule `api/cron/pre-index` daily at `0 21 * * *` (3:00 AM IST = 21:30 UTC) | Validation: `vercel.json` has valid cron syntax, path matches route |
| 8.8 | Trending product tap → instant review — clicking a trending card triggers text-input pipeline path with product name, loads cached review | Playwright E2E: click trending "Redmi Note 15" card → pipeline runs → cached review card appears (fast, cached=true) |

---

## Sprint 9: SEO Pages & Analytics

**Sprint Goal:** Static SEO review pages for every indexed product. Analytics tracking for all user actions.

**Demo:** Visit `/review/redmi-note-15` → see full review page with OG tags. PostHog dashboard shows query events.

| ID | Task | Test / Validation |
|---|---|---|
| 9.1 | Build SEO review page (`src/app/review/[slug]/page.tsx`) — Server Component fetches review from Postgres by slug, renders full ReviewCard + AudioPlayer (if audio exists) + source links | Integration test: seed product + review → GET `/review/redmi-note-15` → 200 with HTML containing verdict, pros, cons |
| 9.2 | Implement `generateMetadata` for review pages — `<title>`, `<description>`, Open Graph (`og:title`, `og:description`, `og:type`), Twitter card | Unit test: metadata for "Redmi Note 15" includes product name in title, verdict in description, `og:type="article"` |
| 9.3 | Implement `generateStaticParams` — pre-generate static pages for all products with reviews, ISR revalidation every 24h | Validation: `next build` output shows static routes for seeded products. Runtime: stale page triggers revalidation. |
| 9.4 | Handle missing product in review page — if slug not found, return `notFound()` → Next.js 404 page | Playwright: visit `/review/nonexistent-phone` → 404 page rendered |
| 9.5 | Add PostHog analytics provider — install `posthog-js`, wrap app in `PostHogProvider` (client component), track `$pageview` | Validation: visit app → PostHog dashboard shows pageview event with correct URL |
| 9.6 | Track custom PostHog events — `query_submitted` (language, input_type), `review_displayed` (product, cached, latency), `audio_played` (product, language), `rate_limited`, `error_occurred` (code) | Validation: trigger each action → corresponding event in PostHog with correct properties |
| 9.7 | Add Vercel Analytics + Speed Insights — install `@vercel/analytics` + `@vercel/speed-insights`, add components to root layout | Validation: packages installed, components in layout, `npm run build` succeeds |

---

## Sprint 10: Polish, Hardening & Production Deploy

**Sprint Goal:** Production-ready app. Polished error states, mobile-optimized, deployed on Vercel with all env vars configured.

**Demo:** Production URL live. Full flow works end-to-end. All error states graceful. Mobile-first UX verified.

| ID | Task | Test / Validation |
|---|---|---|
| 10.1 | Polish error state UI — design error cards for each code: `NO_REVIEWS` (show trending fallback), `NOT_A_PRODUCT` (show query chips), `RATE_LIMITED` (show countdown to reset), `STT_FAILED` (show retry + tips), `SERVICE_UNAVAILABLE` (show retry after delay) | Playwright: trigger each error → correct card rendered with expected CTA (retry button, suggestions, countdown) |
| 10.2 | Add retry mechanism — "Try Again" button on `STT_FAILED` and `SERVICE_UNAVAILABLE` resets UI and re-activates mic recording | Playwright: error shown → click "Try Again" → UI resets to idle state, mic ready |
| 10.3 | Mobile responsiveness audit — test all components at 360px (SE), 390px (iPhone 14), 414px (iPhone 14 Plus) viewports | Playwright visual snapshot tests at 3 viewports: no horizontal overflow, mic button centered, review card readable, audio player full-width |
| 10.4 | Accessibility audit — keyboard navigation (Tab through mic → chips → trending), screen reader labels, focus management, color contrast (WCAG AA) | Manual audit + axe-playwright: zero critical/serious a11y violations |
| 10.5 | Loading states audit — verify every async operation has visible feedback: mic recording pulse, STT processing spinner, scraping animation, synthesis shimmer, audio loading spinner | Playwright: each state transition has non-empty visual indicator (no blank screens) |
| 10.6 | Create production `.env` documentation — list every env var, where to get it, example values | Validation: document covers all vars from `.env.example`, includes links to Sarvam/Firecrawl/Neon/Upstash dashboards |
| 10.7 | Configure `vercel.json` — function maxDuration (60s for `/api/query`), cron schedule, rewrites if needed | Validation: config valid, `vercel.json` schema passes |
| 10.8 | Deploy to Vercel — connect Git repo, configure all env vars, run first build | Validation: build succeeds, production URL loads landing page |
| 10.9 | Production smoke test — full voice query on production URL, verify SSE streaming, review card, audio playback | Manual: record voice → transcript appears → review card renders → audio plays. All in <30s. |
| 10.10 | Verify cron job on Vercel — check Vercel dashboard for scheduled cron, trigger manual run | Validation: cron visible in dashboard, manual trigger returns `{indexed: N}` |
| 10.11 | Run full E2E test suite against production | All Playwright E2E tests pass against production URL (with extended timeouts for real API latency) |

---

## Sprint Dependency Graph

```
Sprint 1  (Foundation)
    ↓
Sprint 2  (Voice + STT + SSE)
    ↓
Sprint 3  (Intent + Entity)
    ↓
Sprint 4  (Scraping + Content)
    ↓
Sprint 5  (Synthesis + Review Card)
    ↓
Sprint 6  (Translation + TTS + Audio)
    ↓
Sprint 7  (Caching + Performance)
    ↓
Sprint 8  (Trending + Landing + Cron)
    ↓
Sprint 9  (SEO + Analytics)
    ↓
Sprint 10 (Polish + Deploy)
```

Each sprint is fully demoable:
- **S1:** App loads, DB connected
- **S2:** Voice → transcript on screen
- **S3:** Voice → product entity extracted, non-product rejected
- **S4:** Product name → scraped + normalized review sources (API-level)
- **S5:** Voice → full review card on screen
- **S6:** Voice in any language → review in that language + audio
- **S7:** Repeated queries fast, rate limiting enforced
- **S8:** Beautiful landing page, trending phones, cron pre-indexing
- **S9:** SEO pages, analytics dashboard
- **S10:** Live on production, polished, monitored

---

## Task Count Summary

| Sprint | Tasks | Focus |
|---|---|---|
| Sprint 1 | 16 | Foundation + Data |
| Sprint 2 | 15 | Voice + STT + SSE |
| Sprint 3 | 9 | Intent + Entity |
| Sprint 4 | 11 | Scraping + Content |
| Sprint 5 | 8 | Synthesis + UI |
| Sprint 6 | 11 | Translation + Audio |
| Sprint 7 | 10 | Caching + Perf |
| Sprint 8 | 8 | Landing + Cron |
| Sprint 9 | 7 | SEO + Analytics |
| Sprint 10 | 11 | Polish + Deploy |
| **Total** | **106** | |
