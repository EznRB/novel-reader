# CurrentState – Memória Operacional do Projeto

## Resumo Geral
- **Estado atual:** Projeto funcional e estável, com todos os fluxos principais (importação, leitura, TTS, IA, exportação, autenticação) operacionais.
- **Percentual de conclusão:** ~ 90 % (faltam testes automatizados, rate‑limit, migração total do TTS para NVIDIA NIM e suporte multi‑tenant).
- **Funcionalidades principais implementadas:** importação de texto/EPUB, leitor imersivo com controle por teclado, fila de áudio com prefetch, TTS via Edge (planejado migrar para NVIDIA NIM), IA para resumos, extração de personagens e world‑building, exportação PDF/EPUB, autenticação OIDC via Replit, cache persistente em PostgreSQL.
- **Estabilidade:** Sistema estável em desenvolvimento local; nenhuma regressão crítica conhecida.

## Última Atualização
- **Data:** 2024‑07‑01
- **Funcionalidade implementada:** Criação da documentação modular (todos os arquivos em `docs/`), simplificação do `AGENTS.md` e atualização do `.env.example` para usar o endpoint da NVIDIA NIM.
- **Arquivos modificados:** `AGENTS.md`, `PROJECT_RULES.md`, *todos os arquivos recém‑criados em `docs/`*, `.env.example`.
- **Motivo da alteração:** Padronizar a documentação, reduzir o consumo de contexto para IA’s futuras e alinhar a configuração de ambiente ao provedor NVIDIA NIM.

## Última Tarefa Concluída
- **Problema:** Ausência de documentação estruturada; uso ainda misto de OpenAI e NVIDIA NIM nos arquivos de configuração.
- **Solução:** Implementação do conjunto de arquivos em `docs/` (Architecture, Frontend, Backend, etc.), refatoração de `AGENTS.md` para servir apenas como índice, adição de regras de documentação em `PROJECT_RULES.md` e correção do `.env.example` para apontar exclusivamente ao endpoint NVIDIA NIM.
- **Impacto:**
  - IA’s podem agora obter rapidamente a arquitetura e detalhes de componentes lendo apenas `AGENTS.md` + os documentos relevantes.
  - Redução significativa de tokens usados em conversas de suporte/avaliação.
  - Eliminação de ambiguidade sobre qual provedor de IA está em uso.

## Próxima Prioridade
- Implementar testes automatizados (Jest + React Testing Library) para rotas críticas e componentes de UI.
- Adicionar middleware de rate‑limit usando utilitários já presentes (`batch/utils.isRateLimitError`).
- Migrar TTS para o endpoint NVIDIA NIM (`POST /v1/audio/speech`).
- Planejar suporte multi‑tenant (esquema de usuários + isolamento de livros).

## Funcionalidades Implementadas
- ✅ Importação de arquivos `.txt` e `.epub`
- ✅ Leitura imersiva com destaque de sentenças
- ✅ Controle por teclado (play/pause, navegação, modo cinematográfico, etc.)
- ✅ AudioPlayer com fila, prefetch e retry automático
- ✅ TTS via Microsoft Edge Neural (`pt‑BR‑AntonioNeural`)
- ✅ IA para resumos de capítulos (NVIDIA NIM gpt‑4o‑mini)
- ✅ Extração de personagens (classificação, voz)
- ✅ Extração de world‑building (personagens, organizações, locais…)
- ✅ Perguntas & respostas “spoiler‑safe”
- ✅ Exportação PDF e EPUB
- ✅ Upload / remoção de capa (Base64)
- ✅ Autenticação OIDC via Replit
- ✅ Cache persistente em PostgreSQL (resumos, personagens, conhecimento)
- ✅ Documentação modular completa (arquitetura, API, performance, segurança, roadmap, etc.)

## Funcionalidades em Desenvolvimento
- **Testes automatizados** (unit‑/integration) – planejados no roadmap curto prazo.
- **Rate‑limit interno** nas rotas IA/TTS.
- **Migração completa do TTS para NVIDIA NIM** (modelo de voz neural).
- **Suporte multi‑tenant** (usuários múltiplos, isolamento de livros).
- **Busca semântica** usando embeddings NVIDIA NIM.

## Bugs Conhecidos
| Descrição | Impacto | Prioridade | Possível causa | Arquivos envolvidos |
|-----------|---------|-----------|----------------|---------------------|
| `orval.config.ts` perdeu a propriedade `schemas` | Falha na geração de client | Média | Atualização de configuração | `orval.config.ts` |
| Importação direta de `zod/v4` nas rotas | Erro de bundling | Média | Dependência incorreta | `src/routes/*.ts` |
| Falta de middleware de rate‑limit | 429 em uso intenso de IA/TTS | Alta | Nenhum controle de taxa | `src/middleware/*` |
| Armazenamento de capas como Base64 | Tabela `books` inflada | Média | Design inicial | `src/routes/books.ts` |
| Dependência `msedge‑tts` como gargalo | Latência TTS em alta carga | Alta | Limite de chamadas simultâneas | `src/routes/tts.ts` |
| Nenhum mecanismo de invalidação de cache IA | Dados possivelmente desatualizados após edição de capítulo | Média | Falta de versionamento | `src/routes/*` |

## Débitos Técnicos
- Reduzir consumo de memória (especialmente no AudioPlayer).
- Melhorar paralelismo nas chamadas em lote de IA (`batchProcess`).
- Dividir módulo de TTS em camada de abstração para facilitar troca de provedor.
- Otimizar consultas ao PostgreSQL (índices adicionais nas tabelas de cache).
- Implementar mecanismo de versionamento / flag “dirty” para limpar caches IA quando capítulos são editados.

## Arquivos Modificados Recentemente
| Commit | Arquivos | Motivo |
|--------|----------|--------|
| `cf6a537` | `AGENTS.md`, `PROJECT_RULES.md`, `docs/*` (todos) | Documentação modular completa |
| `ec92d1b` | `.env.example` | Atualizar endpoint para NVIDIA NIM |
| `…` (últimos 5 commits) | Diversos scripts de build, `README.md` | Manutenção rotineira |

## Observações Importantes
- **Atualização automática:** Sempre que uma tarefa relevante for concluída (novas funcionalidades, correções importantes, mudanças de arquitetura, refatorações, otimizações, alterações em APIs, DB, IA, TTS) o `CurrentState.md` deve ser revisado e commitado junto às demais alterações.
- **Fonte primária:** Quando houver divergência entre código, documentação (`docs/*`) e este arquivo, a inconsistência deve ser identificada, explicada e corrigida; a fonte de verdade será o código, mas o `CurrentState.md` deve refletir o estado real imediatamente após o commit.
- **Fluxo obrigatório:** Qualquer IA que iniciar uma tarefa deve ler `AGENTS.md`, `PROJECT_RULES.md` e **este** `CurrentState.md` antes de decidir quais documentos de `docs/` são relevantes.

---

*Generated on 2024‑07‑01*