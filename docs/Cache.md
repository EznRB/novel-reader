# Cache

## IA result caches
- `chapter_summaries` – resumo de capítulo (JSON). Populado na primeira chamada a `/chapters/:n/summary`.
- `characters` – lista de personagens extraídos.
- `book_knowledge` – entidades de world‑building.

Cache policy:
- **Read‑through**: ao receber um request, verifica se o registro existe; se não, gera via NVIDIA NIM e persiste.
- **No expiration**: registros permanecem até que o conteúdo do capítulo seja alterado (currently no invalidation; see `Performance.md`).

## TTS audio cache
- In‑memory FIFO cache (máximo 2 frases adiante). Cada entrada revogada assim que não está mais na fila.
- Persisted on disk via `LocalDiskProvider` in `cache/tts`. Use `scripts/backup-cache.sh` to archive the audio cache.

## Cache invalidation (planned)
- Quando um capítulo é editado, remover o registro correspondente de `chapter_summaries` e limpar a fila do `AudioPlayer`.
- Quando vozes são reatribuidas, atualizar `characters.assignedVoice`.

## Diagram (Mermaid)
```mermaid
graph LR
    Request -->|Check DB| Cache[DB cache]
    Cache -->|Hit| Return[Return cached data]
    Cache -->|Miss| AI[Call NVIDIA NIM]
    AI --> DB[Persist result]
    DB --> Return
```
