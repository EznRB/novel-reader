# AI Pipeline

## Prompt Construction
- Cada funcionalidade tem um **system prompt** fixo que define o papel da IA (ex.: “assistente literário”).
- Prompt dinâmico inclui trecho de texto relevante (até 20 000 chars).
- Uso de **NVIDIA NIM** (`gpt‑4o‑mini`) através do client OpenAI‑compatible.

## Batching & Retry
- Utiliza `batch/utils.ts`:
  - `p-limit` controla simultaneidade.
  - `p-retry` aplica back‑off e número máximo de tentativas.
  - Detecta erros de rate‑limit via `isRateLimitError`.

## Parsing de respostas
- Primeiro tenta extrair JSON com regex `/\{[\s\S]*\}/`.
- Fallback para texto puro; loga aviso.

## Caching
- Resultados são armazenados nas tabelas de cache (see `Cache.md`).

## Error handling
- Em caso de erro 429, `batchProcess` aplica novo back‑off.
- Outros erros são propagados e tratados pelo endpoint (ex.: 500).

## Future enhancements
- Centralizar camada de IA em um serviço dedicado para reutilização.
- Implementar fallback para modelos alternativos caso a cota NVIDIA seja atingida.
