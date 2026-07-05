# NoveLit 📖

A personal novel reading web app with a dark navy UI, immersive TTS reader, AI summaries, character extraction, and AI Q&A — built for the reading experience you deserve.

## Features

- **Library** — MangaDex-style dark navy grid with search, filter, sort, favorites, and progress tracking
- **Import** — Paste text, upload `.txt`, or import `.epub` files; chapters auto-detected
- **Immersive Reader** — Sentence-highlighted text, click-to-jump, auto-scroll, font/theme/size settings (persisted to localStorage)
- **Table of Contents** — Quick chapter navigation panel (press `T` or click the list icon)
- **TTS Audio Player** — Microsoft Edge neural TTS, sentence-by-sentence playback, voice/speed settings (persisted)
- **Cinematic Mode** — Vignette overlay + sentence dimming while audio plays (`C` key)
- **AI Summaries** — Per-chapter AI summaries (OpenAI, cached in DB)
- **Characters** — AI extracts characters with name, role, description, first appearance
- **AI Q&A** — Spoiler-safe chat (only answers based on chapters you've read)
- **Export** — Download as PDF or EPUB
- **Cover Upload** — Click the cover art to upload a custom image
- **Profile** — Replit Auth sign-in, reading stats

### Keyboard Shortcuts (Reader)

<!-- redeploy trigger -->
| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `← →` | Previous / Next sentence |
| `Shift + ← →` | Previous / Next chapter |
| `T` | Toggle Table of Contents |
| `C` | Toggle Cinematic mode |
| `Esc` | Close panels |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS v4 + shadcn/ui |
| Backend | Express 5 + Node.js |
| Database | PostgreSQL + Drizzle ORM |
| TTS | `msedge-tts` (Microsoft Edge free neural voices) |
| AI | OpenAI `gpt-4o-mini` via Replit AI Integrations |
| Auth | Replit OIDC (openid-client) |
| Export | pdfkit (PDF) + epub-gen-memory (EPUB) |
| API layer | OpenAPI spec → Orval-generated React Query hooks |

---

## Local Development (Replit)

Everything runs on Replit out of the box. Open the project and the workflows start automatically.

### Required Environment Variables

Copy `.env.example` and fill in your values:

```bash
DATABASE_URL=postgresql://...        # PostgreSQL connection string
SESSION_SECRET=<random-hex-64>       # openssl rand -hex 32
AI_INTEGRATIONS_OPENAI_BASE_URL=...  # OpenAI-compatible base URL
AI_INTEGRATIONS_OPENAI_API_KEY=...   # OpenAI API key
```

### Useful Commands

```bash
# Full typecheck across all packages
pnpm run typecheck

# Rebuild after schema changes
pnpm --filter @workspace/db run push

# Regenerate API client after OpenAPI spec changes
pnpm --filter @workspace/api-spec run codegen
```

---

## Deployment

### Option A — Full-stack container (recommended for self-hosting)

Requires Docker and a PostgreSQL database.

```bash
# Build and run
docker build -t novellit .
docker run -p 8080:8080 \
  -e DATABASE_URL="postgresql://..." \
  -e SESSION_SECRET="..." \
  -e AI_INTEGRATIONS_OPENAI_BASE_URL="https://api.openai.com/v1" \
  -e AI_INTEGRATIONS_OPENAI_API_KEY="sk-..." \
  novellit
```

Or use [Railway](https://railway.app), [Render](https://render.com), or [Fly.io] — all support Docker deployments with managed PostgreSQL.

### Option B — Frontend on Vercel + API on Railway

1. **Deploy the API** to Railway (or any Node.js host):
   - Set all env vars from `.env.example`
   - Note your API domain (e.g. `https://novellit-api.up.railway.app`)

2. **Deploy the frontend** to Vercel:
   - Edit `vercel.json` and replace `YOUR_API_DOMAIN` with your API domain
   - Set environment variables in Vercel dashboard:
     - `PORT=3000`
     - `BASE_PATH=/`
   - Push to GitHub and import the repo in Vercel

### Database Migrations

Run schema migrations against production:

```bash
DATABASE_URL="postgresql://prod-url..." pnpm --filter @workspace/db run push
```

---

## Project Structure

```
artifacts/
  api-server/         # Express 5 backend
    src/routes/       # books, chapters, tts, ai, export, epub-import, auth…
  novel-reader/       # React + Vite frontend
    src/pages/        # library, reader, import, book-detail, ask, profile
    src/components/   # audio-player, shadcn/ui components
lib/
  api-spec/           # OpenAPI spec (source of truth)
  api-client-react/   # Orval-generated React Query hooks
  api-zod/            # Orval-generated Zod schemas
  db/                 # Drizzle ORM schema + migrations
  integrations-openai-ai-server/  # Pre-configured OpenAI client
```

---

## Architecture Notes

- **Contract-first**: OpenAPI spec → `pnpm --filter @workspace/api-spec run codegen` → hooks + schemas
- **TTS**: Backend streams MP3 via `msedge-tts`. Style param maps to prosody adjustments for emotional reading
- **AI is lazy**: Summaries generated on-demand and cached in DB. Characters extracted on user request
- **Cover images**: Stored as base64 data URIs in PostgreSQL (no object storage needed for personal use)
- **Auth**: Single-user personal app — Replit OIDC. No multi-tenant logic
