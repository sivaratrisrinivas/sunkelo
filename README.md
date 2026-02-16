# SunkeLo

Voice-first phone review app for India.  
Ask about a phone in your language and get a short, balanced review back.

## What This Is

SunkeLo is a web app where people can:

- Speak a phone query (or type it as fallback)
- Get transcript + detected language in real time
- See a structured review response over SSE

Current implementation focus is **Sprint 1 + Sprint 2**:

- Project foundation and developer tooling
- Data layer setup (DB and cache clients, schema, typed models, utilities)
- Voice capture flow
- STT wrapper and streaming API foundation
- UI wiring for voice/text input to streaming response

## Why This Exists

Most product review content is concentrated in a few languages.  
SunkeLo aims to reduce that gap by making phone review discovery easier for users who are more comfortable speaking than typing, and who prefer local languages.

The first two sprints specifically solve:

- A stable base to build on (app structure, lint/test/typecheck, env setup)
- Fast feedback loop for users (record voice, process input, stream progress)
- Clear upgrade path to full review synthesis in later sprints

## How It Works (Current Stage)

1. User records voice from the browser (or types a product name).
2. Client sends input to `POST /api/query`.
3. API validates payload and checks rate limit.
4. For audio input, STT converts speech to text and detects language.
5. API streams status events (`listening` -> `understood` -> `done`) to the UI.
6. UI shows transcript and language badge as soon as events arrive.

## Tech Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- Vitest + Playwright
- Zod for schema validation
- Neon Postgres client + Upstash Redis client integrations

## Project Structure

- `src/app` - pages and API routes
- `src/components` - UI components like voice input and language badge
- `src/hooks` - client hooks for recorder + SSE
- `src/lib` - db/cache/sarvam/pipeline/util modules
- `src/types` - shared TypeScript models
- `docs/spec.md` - full product spec
- `docs/sprints.md` - sprint-by-sprint task plan

## Environment Setup

1. Copy `.env.example` to `.env.local`
2. Fill required keys
3. Run:

```bash
npm install
npm run dev
```

## Validation Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

## What Is Next

After Sprint 2, upcoming work (from `docs/sprints.md`) extends this base into:

- Intent detection and product extraction
- Multi-source scraping
- Review synthesis
- Translation + TTS
- Caching, SEO, analytics, and production hardening
