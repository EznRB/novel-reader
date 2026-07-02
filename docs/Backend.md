# Backend

## Stack
- Express 5
- TypeScript
- Drizzle ORM (PostgreSQL)
- TTS via `TTSProvider` abstraction (default `EdgeTTSProvider`), with persistent audio cache
- NVIDIA NIM (IA) via OpenAI‑compatible SDK

## Principais rotas
| Rota | Propósito |
|------|----------|
| `/api/books` | Importação e gerenciamento de livros |
| `/api/chapters` | Listagem e leitura de capítulos |
| `/api/tts/synthesize` | Gera áudio MP3 a partir de texto |
| `/api/characters` | Extração IA de personagens |
| `/api/knowledge` | Extração de entidades de world‑building |
| `/api/ai` | Perguntas & respostas “spoiler‑safe” |
| `/api/export` | Gera PDF / EPUB |
| `/api/auth/*` | Login/logout OIDC (Replit) |

## IA/TTS Integration
- Cliente `lib/integrations-openai-ai-server/src/client.ts` configura `OpenAI` com `baseURL` apontando para `https://integrate.api.nvidia.com/v1` e `apiKey` da NVIDIA.
- Todas as chamadas são feitas como `openai.chat.completions.create` ou `openai.audio.speech.create`, mas são atendidas pelo serviço NVIDIA NIM.

## Middleware e utilitários
- `batch/utils.ts` – processamento em lote com limite de concorrência e retry.
- `src/middleware/rateLimit.ts` – (planejado) tratamento de limites de taxa.
