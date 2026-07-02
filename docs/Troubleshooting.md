# Troubleshooting

## Problemas conhecidos (extracted from “Débitos Técnicos Identificados”)

### 1. `orval.config.ts` perdeu a propriedade `schemas`
- **Causa:** Atualização recente da configuração.
- **Diagnóstico:** Build falha ao gerar client.
- **Solução:** Re‑adicionar `schemas` ou documentar que não impacta o build atual.

### 2. Importação direta de `zod/v4` nas rotas
- **Causa:** Falha de bundling.
- **Diagnóstico:** Erro ao iniciar server.
- **Solução:** Substituir por tipos exportados de `@workspace/api-zod`.

### 3. Falta de testes automatizados
- **Causa:** Projeto inicial sem cobertura de testes.
- **Diagnóstico:** Risco de regressões.
- **Solução:** Implementar Jest + React Testing Library (Roadmap item 1).

### 4. Rate‑limit interno ausente nas rotas IA/TTS
- **Causa:** Nenhum middleware.
- **Diagnóstico:** 429 responses em uso intensivo.
- **Solução:** Utilizar `batch/utils.isRateLimitError` como middleware (Roadmap item 2).

### 5. Armazenamento de capas como Base64
- **Causa:** Uso de coluna `coverImage` em `books`.
- **Diagnóstico:** Crescimento rápido do tamanho da tabela.
- **Solução:** Migrar para storage externo (S3/Cloudflare R2) e guardar URL (Roadmap item 4).

### 6. Dependência `msedge‑tts` como gargalo
- **Causa:** Limite de chamadas simultâneas e falta de vozes não‑português.
- **Diagnóstico:** Falhas de síntese em alta carga.
- **Solução:** Substituir por NVIDIA NIM voice service (Roadmap item 3).

### 7. Nenhum mecanismo de invalidação de cache
- **Causa:** Cache persistente sem versionamento.
- **Diagnóstico:** IA retorna dados desatualizados após edição de capítulo.
- **Solução:** Implementar flag `dirty` ou versionamento de capítulo (Planejado em Performance/Cache).

## Como reproduzir
- Siga os passos descritos na coluna “Problema” (ex.: chamar `/api/books/:id/cover` com payload grande).

## Como corrigir
- Consulte as soluções listadas acima ou abra issue detalhando o caso.
