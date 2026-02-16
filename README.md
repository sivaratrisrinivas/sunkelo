# SunkeLo

Voice-based product review aggregator for Tier-2/3 India.

Ask in your language. Get a balanced product review back as text + audio.

---

## The Gap

Before buying a phone, TV, or appliance, people watch YouTube and read e-commerce reviews.  
But most useful review content is in Hindi/English.

If someone is most comfortable in Odia, Assamese, or another regional language, product research is harder than it should be.

---

## What We Are Building

SunkeLo is a voice-first product research app.

User says:

`"Redmi Note 15 kaisa hai?"` (or in any supported language)

System does:

1. Converts speech to text and detects language.
2. Finds and aggregates reviews from YouTube + e-commerce + review sites.
3. Uses `Sarvam-M` to produce one balanced opinion from multiple sources.
4. Uses translation (`Mayura`) to include useful content across languages.
5. Uses TTS (`Bulbul`) to return an audio summary in the user's language.
6. Streams progress and results to the UI in real time.

---

## Why This Matters

India's next 500M internet users are voice-first, not text-first.

Product research is frequent, high-intent behavior with no strong regional-language-first experience.  
SunkeLo is built to close that gap with zero-login, tap-and-ask UX.

---

## Product Scope

- **Input:** voice first, text fallback
- **Output:** structured review card + spoken summary
- **Sources:** YouTube, e-commerce reviews, blog reviews
- **Languages:** 11 supported languages (10 Indic + English)
- **Target latency:** first useful response fast, full audio within ~30s
- **Architecture style:** cache-first to reduce cost and improve repeat-query speed

---

## End-to-End Flow (Target)

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

---

## Current Implementation Status

Completed:

- **Sprint 1:** foundation, data layer setup, utilities, project tooling
- **Sprint 2:** voice capture, STT integration layer, SSE pipeline foundation, language badge flow
- **Sprint 3:** intent/entity extraction, alias resolution, progress steps UI, non-product rejection UI, and dedicated Sprint 3 test coverage
- **Sprint 4:** Firecrawl client + source scraping/parsing, Mayura translation wrapper/chunking, source normalization pipeline, `/api/sources` endpoint, and Sprint 4 test suite

Planned next:

- Review synthesis
- Translation + TTS
- Caching/performance
- Trending, SEO pages, analytics, production hardening

Full plan lives in `docs/sprints.md`.  
Detailed product spec lives in `docs/spec.md`.

---

## Tech Stack

- `Next.js` + `React` + `TypeScript`
- `Neon Postgres`
- `Upstash Redis`
- `Sarvam AI` (`Saaras`, `Sarvam-M`, `Mayura`, `Bulbul`)
- `Firecrawl`
- `Vitest` + `Playwright`

---

## Local Setup

1. Create `.env.local` and add required keys (see `docs/spec.md` section `7.3 Environment Variables`).

2. Install and run:

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

---

## Quality Checks

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

---

## Repository Layout

- `src/app` - routes and API endpoints
- `src/components` - UI building blocks
- `src/hooks` - voice and streaming hooks
- `src/lib` - db/cache/ai/pipeline modules
- `src/types` - shared types
- `scripts` - seed and tooling scripts
- `docs/spec.md` - product and architecture specification
- `docs/sprints.md` - sprint-by-sprint execution plan
