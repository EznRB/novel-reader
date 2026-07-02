# PROJECT_RULES – Diretrizes Permanentes para IA

---

## Regras Gerais
- **Nunca modificar código sem compreender sua função.**
- **Nunca reescrever módulos inteiros sem necessidade.**
- **Sempre preservar funcionalidades existentes.**
- **Sempre explicar a causa raiz antes da solução.**
- **Sempre minimizar o escopo das alterações.**
- **Sempre considerar desempenho.**
- **Sempre considerar escalabilidade.**
- **Sempre considerar manutenção futura.**

---

## Fluxo Obrigatório
1. **Ler `AGENTS.md`.** Verificar a documentação da arquitetura, fluxos e decisões.
2. **Entender a arquitetura.** Identificar os componentes impactados (frontend, backend, banco, IA, TTS etc.).
3. **Identificar a causa raiz.** Analisar logs, relatórios ou descrição do problema para encontrar o ponto exato da falha.
4. **Explicar o plano.** Descrever a solução proposta, justificando escolhas e mostrando quais arquivos serão alterados.
5. **Implementar.** Aplicar as mudanças seguindo as boas práticas (commit atômico, testes locais, etc.).
6. **Revisar.** Verificar se o problema foi resolvido, se não houve regressões e se o código continua legível.
7. **Atualizar `AGENTS.md` se necessário.** Quando a alteração impacta a visão geral, diagramas ou a lista de links, atualizar o arquivo de referência.
- **Sempre consultar `AGENTS.md` e, em seguida, os documentos `docs/*` relevantes antes de modificar código.**

---

## Documentação Modular
- Sempre iniciar lendo `AGENTS.md`.
- Em seguida, abrir apenas os documentos em `docs/` que sejam relevantes ao problema.
- Nunca modificar código sem antes compreender a documentação associada.
- Quando uma funcionalidade, endpoint ou módulo for criado, alterado ou removido:
  * Atualizar o arquivo de documentação correspondente em `docs/`.
  * Atualizar `AGENTS.md` apenas se a mudança afetar a visão geral, diagramas ou a lista de links.
- O documento `docs/Security.md` contém a descrição completa do fluxo de autenticação e gerenciamento de sessões (login, logout, usuário).

---

## Regras para Refatoração
- **Nunca refatorar apenas por preferência.** A refatoração deve ter um objetivo claro (performance, segurança, manutenção).
- **Nunca alterar APIs públicas sem necessidade.** Quebras de contrato provocam efeitos cascata nos consumidores.
- **Nunca criar duplicação de lógica.** Código duplicado aumenta a dívida técnica.
- **Sempre reutilizar código existente.** Use helpers, utilitários ou hooks já disponíveis antes de escrever novo código.

---

## Regra Final
**Agir como engenheiro de software sênior responsável pela evolução de longo prazo do projeto.**

- Priorizar estabilidade, clareza e futuro crescimento do código‑base acima de soluções rápidas.
- Manter a documentação atualizada e garantir que todo o time (humano ou IA) compreenda as decisões tomadas.
- Avaliar impactos de performance, escalabilidade e manutenção antes de qualquer mudança.
