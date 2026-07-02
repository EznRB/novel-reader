# Architecture

## Visão geral
NoveLit é uma aplicação web single‑user para leitura de romances digitais, combinando biblioteca visual, importação de textos, leitor imersivo, TTS, IA e exportação.

## Diagrama de alto nível
```mermaid
┌───────────────────────┐   HTTP   ┌───────────────────────┐
│  Frontend (Vite + React)│◀───────▶│   API Server (Express) │
│  src/                  │          │   src/                  │
│  – pages/reader.tsx   │          │   – routes/…            │
│  – components/audio‑player.tsx │  │   – tts.ts (msedge‑tts)│
│  – hooks/               │          │   – ai.ts, chapters.ts │
└───────▲───────────────┘          └───────▲─────────────────┘
         │                                 │
         │ (REST/JSON)                     │ (REST/JSON)
         ▼                                 ▼
    PostgreSQL (Drizzle ORM)   ←─────  NVIDIA NIM endpoint
    lib/db/src/schema/*           (OpenAI‑compatible client)
```

## Comunicação entre módulos
- Frontend <-> API Server: HTTP/JSON
- API Server <-> PostgreSQL: Drizzle ORM
- API Server <-> NVIDIA NIM: OpenAI‑compatible client (endpoint `https://integrate.api.nvidia.com/v1`)
- TTS: local ``TTSProvider` abstraction (default `EdgeTTSProvider`)` (future NVIDIA voice service)

## Responsabilidades por camada
| Camada | Responsabilidade |
|--------|------------------|
| Frontend | UI, React Query hooks, state, keyboard shortcuts |
| API Server | Rotas REST, validação, IA/TTS orchestration, cache persistence |
| Banco de Dados | Armazenamento de livros, capítulos, progresso, caches de IA |
| IA/TTS | Prompt construction, batch processing, retry, result caching |
| TTS | `TTSProvider` abstraction, `EdgeTTSProvider` implementation, audio cache on disk |
