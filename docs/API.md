# API

## Catálogo resumido
| Método | Rota | Função |
|--------|------|--------|
| GET | `/api/healthz` | Verifica saúde |
| GET | `/api/auth/user` | Retorna usuário autenticado |
| GET | `/api/auth/login` | Inicia fluxo OIDC |
| GET | `/api/auth/logout` | Finaliza sessão |
| POST | `/api/books` | Cria livro + capítulos (import) |
| GET | `/api/books` | Lista livros |
| GET | `/api/books/:id` | Detalhes do livro |
| PATCH | `/api/books/:id` | Atualiza metadados |
| DELETE | `/api/books/:id` | Remove livro (cascade) |
| GET | `/api/books/:id/chapters` | Lista capítulos |
| GET | `/api/books/:id/chapters/:chapterNumber` | Capítulo individual |
| GET | `/api/books/:id/chapters/:chapterNumber/summary` | Resumo IA (lazy) |
| POST | `/api/books/:id/characters` | IA – extrai personagens |
| GET | `/api/books/:id/characters` | Lista personagens |
| POST | `/api/books/:id/characters/assign-voices` | Atribui vozes 3‑camadas |
| GET | `/api/books/:id/knowledge` | Lista entidades de world‑building |
| POST | `/api/books/:id/knowledge/extract` | IA – extrai conhecimento |
| POST | `/api/books/:id/ask` | IA – Q&A “spoiler‑safe” |
| GET | `/api/tts/voices` | Lista vozes Edge disponíveis |
| POST | `/api/tts/synthesize` | Gera MP3 a partir de texto |
| GET | `/api/export/:id/pdf` | Exporta PDF |
| GET | `/api/export/:id/epub` | Exporta EPUB |
| POST | `/api/books/:id/cover` | Upload capa (Base64) |
| DELETE | `/api/books/:id/cover` | Remove capa |

All routes are mounted under `/api` (see `src/routes/index.ts`). IA‑generated resources (summaries, characters, knowledge) are cached in the DB; subsequent requests return the stored record without invoking the NVIDIA NIM endpoint again.
