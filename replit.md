# NoveLit

A personal novel reading web app with library management, TXT import, immersive TTS reader (Edge TTS via backend), AI chapter summaries, character extraction, AI Q&A, PDF/EPUB export, book cover upload, delete books, and a profile page with Replit Auth.

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
- **TTS:** `msedge-tts` — Microsoft Edge free neural TTS, streamed as MP3 from `/api/tts/synthesize`; supports `style` param (narration/dialogue/cheerful/sad/excited/angry/whisper) mapped to prosody adjustments
- **Auth:** Replit OIDC (openid-client), session stored via cookie-parser + express-session
- **Export:** `pdfkit` (PDF), `epub-gen-memory` (EPUB) — both externalized in esbuild
- **Routing:** wouter
- **API client:** Orval-generated React Query hooks (`@workspace/api-client-react`)
- **Validation:** Zod v4, drizzle-zod

## Where things live

```
artifacts/novel-reader/     # React frontend
  src/pages/
    library.tsx             # Home — book grid, search, favorites, continue reading, delete
    import.tsx              # Import novel (paste/TXT upload)
    book-detail.tsx         # Book overview, chapters list, characters, stats, cover upload, delete
    reader.tsx              # Immersive TTS reader: cinematic mode, keyboard shortcuts, sentence highlighting
    ask.tsx                 # AI Q&A chat interface
    profile.tsx             # Profile page: Replit Auth, reading stats
  src/components/
    audio-player.tsx        # Edge TTS player: sentiment-based voice styles, immersive mode, waveform
  src/hooks/
    use-auth.ts             # Replit Auth hook (OIDC login/logout/user)
artifacts/api-server/       # Express API
  src/routes/
    books.ts                # Books CRUD + chapter auto-parse + stats
    chapters.ts             # Chapters + AI summaries (OpenAI)
    characters.ts           # Character list + AI extraction
    progress.ts             # Reading progress tracking
    ai.ts                   # AI Q&A endpoint
    tts.ts                  # GET /tts/voices, POST /tts/synthesize (style → prosody)
    export.ts               # GET /books/:id/export/pdf|epub
    cover.ts                # POST/DELETE /books/:id/cover (base64 in DB, multer)
    auth.ts                 # GET /auth/login, /auth/callback, /auth/logout, /auth/me (OIDC)
  src/lib/auth.ts           # AuthUser type, OIDC config helpers
  src/authMiddleware.ts     # Sets req.user from session
  build.mjs                 # esbuild config — pdfkit, epub-gen-memory, fontkit externalized
lib/api-spec/openapi.yaml   # OpenAPI contract (source of truth)
lib/db/src/schema/          # Drizzle schema (books, chapters, progress, summaries, characters, sessions)
lib/api-client-react/       # Orval-generated React Query hooks
lib/api-zod/                # Orval-generated Zod schemas
lib/integrations-openai-ai-server/  # Pre-configured OpenAI client + utilities
```

## Architecture decisions

- **Contract-first API:** OpenAPI spec defined first, Orval generates hooks + Zod schemas. Run codegen after any spec change.
- **Chapter auto-parsing:** `POST /api/books` accepts raw text and auto-splits into chapters via regex (Chapter N, CHAPTER N, numbered headings). Falls back to whole text as one chapter.
- **Edge TTS (free):** Backend streams MP3 audio via `msedge-tts`. Style param maps to prosody rateDelta/pitch/volume adjustments. Frontend detects tone (dialogue, sad, excited, angry, whisper) from sentence text when immersive mode is on.
- **AI is lazy:** Summaries generated on-demand when summary panel opens. Characters extracted on user request. Results cached in DB.
- **PDF/EPUB externalized:** `pdfkit`, `epub-gen-memory`, `fontkit`, `brotli` must be in esbuild `external[]`.
- **Cover image stored as base64 data URI** in the `coverImage TEXT` DB column — no object storage needed for a personal app.
- **No route uses `zod/v4` directly** — use manual validation or import schemas from `@workspace/api-zod`. esbuild can't resolve the `zod/v4` subpath.

## Product

- **Library:** MangaDex-style dark navy UI, search, filter, mark favorites, continue reading strip, delete with confirmation
- **Import:** Paste text or upload `.txt` files; chapters auto-detected
- **Reader:** Sentence-highlighted text, click-to-jump, auto-scroll, font/theme settings, AI summary sidebar
  - **Cinematic mode** (`C` key or Film icon): vignette overlay + sentence dimming while audio plays
  - **Keyboard shortcuts:** Space=play/pause, ←/→=sentence nav, Shift+←/→=chapter nav, Esc=close summary
- **TTS Audio Player:** Edge TTS neural voices, sentence-by-sentence playback, prefetch, speed slider, immersive style detection badge
- **AI Summaries:** Per-chapter summaries via OpenAI, cached in DB
- **Characters:** AI extracts characters with name, role, description, first appearance
- **AI Q&A:** Spoiler-safe chat — only answers based on chapters you've read
- **Export:** Download book as PDF or EPUB from the book detail page
- **Cover Upload:** Click the cover art on book detail to upload a custom image (JPEG/PNG/WebP/GIF)
- **Delete:** Trash icon on book cards (hover) and book detail header with confirmation dialog
- **Profile:** `/profile` page with Replit Auth sign-in, avatar, name, and reading stats

## User preferences

- MangaDex-style dark navy aesthetic
- Single-user personal reading app (no multi-tenant logic needed)

## Gotchas

- After editing the OpenAPI spec, always run `pnpm --filter @workspace/api-spec run codegen` to regenerate client hooks.
- The `orval.config.ts` `schemas` property was removed — don't add it back.
- `lib/api-zod/src/index.ts` is overwritten post-codegen to re-export from `./generated/api` — don't revert this pattern.
- The `integrations-openai-ai-server` lib must be built (`tsc --build`) before the API server can typecheck.
- All API routes in `src/routes/*.ts` must use paths **without** `/api/` prefix — the router is already mounted at `/api` in `app.ts`.
- `pdfkit`, `epub-gen-memory`, `fontkit`, `brotli`, `linebreak`, `png-js` must stay in esbuild `external[]` in `build.mjs`.
- **Never import from `zod/v4`** in API server routes — esbuild can't resolve the subpath. Use manual validation or `@workspace/api-zod` schemas.

## Pointers

- `.local/skills/pnpm-workspace/` — workspace conventions, codegen, server/DB references
- `.local/skills/react-vite/` — Vite frontend patterns, theming rules
- `.local/skills/replit-auth/` — Replit OIDC auth patterns
