# NoveLit

A personal novel reading web app with library management, TXT import, immersive TTS reader (Edge TTS via backend), AI chapter summaries, character extraction, AI Q&A, and PDF/EPUB export.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

**Required env vars:** `DATABASE_URL`, `SESSION_SECRET`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`

## Stack

- **Frontend:** React + Vite + Tailwind CSS v4 + shadcn/ui, hosted at `/`
- **Backend:** Express 5, hosted at `/api`
- **Database:** PostgreSQL + Drizzle ORM
- **AI:** OpenAI via Replit AI Integrations (`lib/integrations-openai-ai-server`)
- **TTS:** `msedge-tts` — Microsoft Edge free neural TTS, streamed as MP3 from `/api/tts/synthesize`
- **Export:** `pdfkit` (PDF), `epub-gen-memory` (EPUB) — both externalized in esbuild
- **Routing:** wouter
- **API client:** Orval-generated React Query hooks (`@workspace/api-client-react`)
- **Validation:** Zod v4, drizzle-zod

## Where things live

```
artifacts/novel-reader/     # React frontend
  src/pages/
    library.tsx             # Home — book grid, search, favorites, continue reading
    import.tsx              # Import novel (paste/TXT upload)
    book-detail.tsx         # Book overview, chapters list, characters, stats, export buttons
    reader.tsx              # Immersive TTS reader with sentence highlighting
    ask.tsx                 # AI Q&A chat interface
  src/components/
    audio-player.tsx        # Sentence-by-sentence Edge TTS player, voice selector, rate slider
artifacts/api-server/       # Express API
  src/routes/
    books.ts                # Books CRUD + chapter auto-parse + stats
    chapters.ts             # Chapters + AI summaries (OpenAI)
    characters.ts           # Character list + AI extraction
    progress.ts             # Reading progress tracking
    ai.ts                   # AI Q&A endpoint
    tts.ts                  # GET /tts/voices, POST /tts/synthesize (Edge TTS)
    export.ts               # GET /books/:id/export/pdf|epub
  build.mjs                 # esbuild config — pdfkit, epub-gen-memory, fontkit externalized
lib/api-spec/openapi.yaml   # OpenAPI contract (source of truth)
lib/db/src/schema/          # Drizzle schema (books, chapters, progress, summaries, characters)
lib/api-client-react/       # Orval-generated React Query hooks
lib/api-zod/                # Orval-generated Zod schemas
lib/integrations-openai-ai-server/  # Pre-configured OpenAI client + utilities
```

## Architecture decisions

- **Contract-first API:** OpenAPI spec defined first, Orval generates hooks + Zod schemas. Run codegen after any spec change.
- **Chapter auto-parsing:** `POST /api/books` accepts raw text and auto-splits into chapters via regex (Chapter N, CHAPTER N, numbered headings). Falls back to whole text as one chapter.
- **Edge TTS (free):** Backend streams MP3 audio via `msedge-tts` — no API key needed. Frontend requests each sentence individually, prefetches next sentence. Voice selector shows 300+ Microsoft neural voices grouped by language.
- **AI is lazy:** Summaries generated on-demand when summary panel opens. Characters extracted on user request. Results cached in DB.
- **PDF/EPUB externalized:** `pdfkit`, `epub-gen-memory`, `fontkit`, `brotli` must be in esbuild `external[]` — they use `@swc/helpers` CJS at runtime and cannot be bundled.
- **No auth:** Single-user personal reading app.

## Product

- **Library:** MangaDex-style dark navy UI, search, filter, mark favorites, continue reading strip
- **Import:** Paste text or upload `.txt` files; chapters auto-detected
- **Reader:** Sentence-highlighted text, click-to-jump, auto-scroll, font/theme settings, AI summary sidebar
- **TTS Audio Player:** Edge TTS neural voices, sentence-by-sentence playback, prefetch, speed slider (−50% to +50%), waveform animation
- **AI Summaries:** Per-chapter summaries via OpenAI, cached in DB
- **Characters:** AI extracts characters with name, role, description, first appearance
- **AI Q&A:** Spoiler-safe chat — only answers based on chapters you've read
- **Export:** Download book as PDF or EPUB from the book detail page

## Gotchas

- After editing the OpenAPI spec, always run `pnpm --filter @workspace/api-spec run codegen` to regenerate client hooks.
- The `orval.config.ts` `schemas` property was removed — don't add it back.
- `lib/api-zod/src/index.ts` is overwritten post-codegen to re-export from `./generated/api` — don't revert this pattern.
- The `integrations-openai-ai-server` lib must be built (`tsc --build`) before the API server can typecheck.
- All API routes in `src/routes/*.ts` must use paths **without** `/api/` prefix — the router is already mounted at `/api` in `app.ts`.
- `pdfkit`, `epub-gen-memory`, `fontkit`, `brotli`, `linebreak`, `png-js` must stay in esbuild `external[]` in `build.mjs`.

## Pointers

- `.local/skills/pnpm-workspace/` — workspace conventions, codegen, server/DB references
- `.local/skills/react-vite/` — Vite frontend patterns, theming rules
