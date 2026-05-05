# NoveLit

A personal novel reading web app with library management, TXT import, immersive TTS reader, AI chapter summaries, character extraction, and AI Q&A.

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
- **Routing:** wouter
- **API client:** Orval-generated React Query hooks (`@workspace/api-client-react`)
- **Validation:** Zod v4, drizzle-zod

## Where things live

```
artifacts/novel-reader/     # React frontend
  src/pages/
    library.tsx             # Home — book grid, search, favorites, continue reading
    import.tsx              # Import novel (paste/TXT upload)
    book-detail.tsx         # Book overview, chapters list, characters, stats
    reader.tsx              # Immersive TTS reader with word highlighting
    ask.tsx                 # AI Q&A chat interface
artifacts/api-server/       # Express API
  src/routes/
    books.ts                # Books CRUD + chapter auto-parse + stats
    chapters.ts             # Chapters + AI summaries (OpenAI)
    characters.ts           # Character list + AI extraction
    progress.ts             # Reading progress tracking
    ai.ts                   # AI Q&A endpoint
lib/api-spec/openapi.yaml   # OpenAPI contract (source of truth)
lib/db/src/schema/          # Drizzle schema (books, chapters, progress, summaries, characters)
lib/api-client-react/       # Orval-generated React Query hooks
lib/api-zod/                # Orval-generated Zod schemas
lib/integrations-openai-ai-server/  # Pre-configured OpenAI client + utilities
```

## Architecture decisions

- **Contract-first API:** OpenAPI spec defined first, Orval generates hooks + Zod schemas. Run codegen after any spec change.
- **Chapter auto-parsing:** `POST /api/books` accepts raw text content and auto-splits into chapters using regex patterns (Chapter N, CHAPTER N, numbered headings). Falls back to treating the whole text as one chapter.
- **TTS via Web Speech API:** The reader uses the browser's built-in `SpeechSynthesis` API for voice narration with word-boundary events for real-time word highlighting.
- **AI is lazy:** Summaries are generated on-demand when the summary panel opens (`GET /api/books/:id/chapters/:num/summary`). Characters are extracted on user request. Results are cached in the DB.
- **No auth:** This is a single-user personal reading app — no authentication layer.

## Product

- **Library:** Search, filter, mark favorites, see reading progress at a glance
- **Import:** Paste text or upload `.txt` files; chapters auto-detected
- **Reader:** Word-highlighted TTS narration, adjustable speed + voice, auto-save progress, font size control
- **AI Summaries:** Per-chapter AI summaries generated via OpenAI, shown in a slide-out panel
- **Characters:** AI extracts characters with name, role, description, first appearance
- **AI Q&A:** Chat interface that answers questions based only on chapters you've read (spoiler-safe)

## Gotchas

- After editing the OpenAPI spec, always run `pnpm --filter @workspace/api-spec run codegen` to regenerate client hooks.
- The `orval.config.ts` `schemas` property was removed — don't add it back (causes type conflicts with api-zod barrel).
- `lib/api-zod/src/index.ts` is overwritten post-codegen to re-export from `./generated/api` — don't revert this pattern.
- The `integrations-openai-ai-server` lib must be built (`tsc --build`) before the API server can typecheck against it.
- Paths are not rewritten by the proxy — all API routes must be prefixed with `/api`.

## Pointers

- `.local/skills/pnpm-workspace/` — workspace conventions, codegen, server/DB references
- `.local/skills/react-vite/` — Vite frontend patterns, theming rules
