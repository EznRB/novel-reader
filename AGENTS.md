# AGENTS – Architecture & Operations Guide for NoveLit

> **Version**: 1.2 (updated to use the free NVIDIA NIM API)

---

## Visão geral
NoveLit é uma aplicação web single‑user para leitura de romances digitais. Combina biblioteca visual, importação de texto/epub, leitor imersivo com áudio sincronizado, TTS (Edge + future NVIDIA NIM), IA (NVIDIA NIM gpt‑4o‑mini) para resumos, extração de personagens e world‑building, exportação PDF/EPUB e autenticação via Replit OIDC.

## Arquitetura resumida
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

## Documentação detalhada
- 📐 **Architecture** – `docs/Architecture.md`
- 🌐 **Frontend** – `docs/Frontend.md`
- 🛂 **Backend** – `docs/Backend.md`
- 🗄️ **Database** – `docs/Database.md`
- 📡 **API** – `docs/API.md`
- 🎵 **AudioPlayer** – `docs/AudioPlayer.md`
- 🔊 **TTS** – `docs/TTS.md`
- 🧑‍💼 **Character System** – `docs/CharacterSystem.md`
- 🌍 **World Extraction** – `docs/WorldExtraction.md`
- 📦 **Cache** – `docs/Cache.md`
- 🤖 **AI Pipeline** – `docs/AI.md`
- ⚡️ **Performance** – `docs/Performance.md`
- 🔐 **Security & Auth** – `docs/Security.md`
- 🗺️ **Roadmap** – `docs/Roadmap.md`
- 📋 **Decisions** – `docs/Decisions.md`
- 📝 **Changelog** – `docs/Changelog.md`
- 🛠️ **Troubleshooting** – `docs/Troubleshooting.md`

## Fluxo recomendado para IAs futuras
1. Ler este `AGENTS.md`.
2. Identificar os módulos relevantes (ex.: TTS, AudioPlayer, AI).
3. Abrir apenas os documentos `docs/*` necessários.
4. Executar a tarefa, atualizando a documentação correspondente se houver mudanças arquiteturais ou de comportamento.

*Todas as chamadas de IA utilizam o endpoint da **NVIDIA NIM** via cliente OpenAI‑compatible configurado em `lib/integrations-openai-ai-server`.*
