# TTS

## Pipeline completo
1. **Sanitização** – `sanitizeText` remove caracteres problemáticos e corta a 4800 caracteres.
2. **Mapeamento de estilo** – `STYLE_PROSODY` define `rateDelta`, `pitch`, `volume` conforme o tipo de voz (narration, dialogue, etc.).
3. **Retry** – `synthesizeWithRetry` tenta até 3 vezes, com back‑off exponencial (400 ms, 800 ms, 1600 ms).
4. **Síntese** – `MsEdgeTTS` (voz padrão `pt‑BR‑AntonioNeural`) gera stream MP3 (`OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3`).
5. **Buffer** – Chunks são acumulados até ≥ 1 KB antes de enviar ao cliente.

## Validação
- Texto truncado a 4800 chars para evitar limites do TTS.
- Substitui caracteres como “«”, “»”, etc.

## Cache
- Não há cache persistente; áudio é mantido em memória apenas enquanto a fila está ativa.
- Futuro: substituir `MsEdgeTTS` por `POST /v1/audio/speech` da NVIDIA NIM (modelo de voz neural) – mudança contida em `lib/integrations-openai-ai-server/src/client.ts`.

## Retries & erros
- Falhas de rede ou limite de taxa acionam retry.
- Após esgotar tentativas, o player pula a frase e registra um aviso no log.

## Vozes disponíveis
`GET /api/tts/voices` lista vozes Edge; a camada de voz de personagens utiliza pools definidos no backend (`MAIN_MALE_VOICES`, `DEFAULT_FEMALE_VOICE`, …).
