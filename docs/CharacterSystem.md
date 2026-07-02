# Character System

## Extração de personagens (IA)
- Endpoint: `POST /api/books/:id/characters`
- Prompt: solicita JSON com `name`, `description`, `role`, `gender`, `firstAppearanceChapter`.
- Batch: processa até 60 capítulos (30 primeiros com 800 chars, 30 seguintes com 400 chars) usando `batchProcess`.

## Classificação
- Role values: `protagonist`, `antagonist`, `supporting`, `minor`.
- Gender: `male`, `female`, `unknown`.

## Persistência
- Resultados são inseridos na tabela **characters**.
- Chave primária `id`; `bookId` FK liga ao livro.

## Atribuição de vozes (3 camadas)
| Camada | Estratégia | Fonte de voz |
|--------|------------|--------------|
| 1 – Principais | Voz única por personagem principal/antagonista | `MAIN_MALE_VOICES` / `MAIN_FEMALE_VOICES` (primeira livre) |
| 2 – Secundários | Voz compartilhada por gênero | `DEFAULT_MALE_VOICE` / `DEFAULT_FEMALE_VOICE` |
| 3 – Figurantes | Voz genérica ou `DEFAULT_UNKNOWN_VOICE` |

Endpoint `POST /books/:id/characters/assign-voices` realiza a atribuição e salva o campo `assignedVoice` na tabela `characters`.

## Relacionamento com AudioPlayer
- `AudioPlayer` consulta `characters.assignedVoice` ao montar o mapa `character → voice`.
