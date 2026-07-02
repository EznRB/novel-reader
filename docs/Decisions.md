# Decisions

- **2024‑07‑01** – Documentação dispersa → criar documentação modular em `docs/`.  
  *Benefício*: Reduz consumo de contexto, facilita busca, permite atualização granular.  
  *Conseq.*: Necessário sincronizar AGENTS.md com links.

- **2024‑07‑01** – Uso de SDK OpenAI vs NVIDIA NIM → usar cliente OpenAI‑compatible configurado para NVIDIA NIM (já implementado).  
  *Benefício*: Aproveita SDK existente sem mudar código.  
  *Conseq.*: Nome “OpenAI” pode gerar confusão – documentação esclarece.

- **2024‑07‑01** – Estrutura de voz do TTS → planejar migração futura para NVIDIA voice API, manter compatibilidade.  
  *Benefício*: Flexibilidade, melhor qualidade de voz.  
  *Conseq.*: Necessita refatoração futura.

- **2024‑07‑01** – Estratégia de cache IA → persistir resultados em BD (`chapter_summaries`, `characters`, `book_knowledge`).  
  *Benefício*: Reduz chamadas, garante consistência.  
  *Conseq.*: Cache pode ficar desatualizado se conteúdo mudar.
