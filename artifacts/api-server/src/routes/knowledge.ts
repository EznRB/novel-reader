import { Router, type IRouter } from "express";
import { and, eq, lte } from "drizzle-orm";
import { db, booksTable, chaptersTable, bookKnowledgeTable, readingProgressTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /books/:id/knowledge
router.get("/books/:id/knowledge", async (req, res): Promise<void> => {
  const bookId = parseInt(req.params.id, 10);
  if (isNaN(bookId)) {
    res.status(400).json({ error: "ID de livro inválido" });
    return;
  }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, bookId));
  if (!book) {
    res.status(404).json({ error: "Livro não encontrado" });
    return;
  }

  const entities = await db
    .select()
    .from(bookKnowledgeTable)
    .where(eq(bookKnowledgeTable.bookId, bookId))
    .orderBy(bookKnowledgeTable.entityType, bookKnowledgeTable.name);

  res.json(entities);
});

// POST /books/:id/knowledge/extract
router.post("/books/:id/knowledge/extract", async (req, res): Promise<void> => {
  const bookId = parseInt(req.params.id, 10);
  if (isNaN(bookId)) {
    res.status(400).json({ error: "ID de livro inválido" });
    return;
  }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, bookId));
  if (!book) {
    res.status(404).json({ error: "Livro não encontrado" });
    return;
  }

  const [progress] = await db
    .select()
    .from(readingProgressTable)
    .where(eq(readingProgressTable.bookId, bookId));

  const upToChapter = progress?.currentChapter ?? book.totalChapters;

  const chapters = await db
    .select({ chapterNumber: chaptersTable.chapterNumber, content: chaptersTable.content, title: chaptersTable.title })
    .from(chaptersTable)
    .where(and(eq(chaptersTable.bookId, bookId), lte(chaptersTable.chapterNumber, upToChapter)))
    .orderBy(chaptersTable.chapterNumber);

  // Estratégia de orçamento por capítulo para máxima precisão:
  // - Capítulos 1-25 (introdução da maioria das entidades): 700 chars
  // - Capítulos 26-50: 350 chars
  // Total: ~25k chars com marcadores claros
  const MAX_TOTAL = Math.min(upToChapter, 50);
  const combinedText = chapters
    .filter((c) => c.chapterNumber <= MAX_TOTAL)
    .map((c) => {
      const budget = c.chapterNumber <= 25 ? 700 : 350;
      const label = c.title ? `${c.title}` : `Capítulo ${c.chapterNumber}`;
      return `[CAPÍTULO ${c.chapterNumber} — ${label}]:\n${c.content.slice(0, budget)}`;
    })
    .join("\n\n---\n\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 2800,
      messages: [
        {
          role: "system",
          content: `Você é um analista de world-building para romances. Extraia TODAS as entidades nomeadas do texto.

REGRAS CRÍTICAS:
1. O campo "firstChapter" e "chapter" DEVE ser exatamente o número N do marcador [CAPÍTULO N] onde a entidade aparece pela PRIMEIRA VEZ. Jamais invente números de capítulos.
2. Use apenas capítulos presentes no texto fornecido com marcadores [CAPÍTULO N].
3. Responda em Português do Brasil (pt-BR). Todas as descrições em português.
4. Retorne APENAS JSON válido — sem markdown, sem explicações.

Retorne um objeto JSON com estes arrays (inclua apenas entidades que claramente aparecem no texto):
{
  "characters": [{"name": "Nome Completo", "description": "papel e personalidade em 1-2 frases", "firstChapter": 1}],
  "organizations": [{"name": "Nome", "description": "tipo de organização e propósito"}],
  "factions": [{"name": "Nome", "description": "alinhamento e objetivos"}],
  "locations": [{"name": "Nome", "description": "tipo de lugar e sua importância"}],
  "skills": [{"name": "Nome da Habilidade/Poder", "owner": "Nome do Personagem", "description": "o que faz"}],
  "artifacts": [{"name": "Nome do Item", "owner": "Nome do Personagem ou desconhecido", "description": "o que é e seu poder"}],
  "events": [{"description": "Evento importante em 1 frase em português", "chapter": 1, "importance": "high|medium|low"}]
}`,
        },
        {
          role: "user",
          content: combinedText,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    let extracted: Record<string, Array<Record<string, unknown>>> = {};

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
    } catch {
      logger.warn("Falha ao parsear JSON de extração de conhecimento");
    }

    // Limpa e re-insere
    await db.delete(bookKnowledgeTable).where(eq(bookKnowledgeTable.bookId, bookId));

    const TYPE_MAP: Record<string, string> = {
      characters: "character",
      organizations: "organization",
      factions: "faction",
      locations: "location",
      skills: "skill",
      artifacts: "artifact",
      events: "event",
    };

    const toInsert: {
      bookId: number;
      entityType: string;
      name: string;
      description: string | null;
      firstAppearanceChapter: number | null;
      lastMentionedChapter: number | null;
      metadata: Record<string, unknown> | null;
    }[] = [];

    for (const [key, items] of Object.entries(extracted)) {
      if (!Array.isArray(items) || !(key in TYPE_MAP)) continue;
      const type = TYPE_MAP[key];

      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const name = String(item.name ?? item.description ?? "").slice(0, 200).trim();
        if (!name) continue;

        toInsert.push({
          bookId,
          entityType: type,
          name,
          description: item.description != null ? String(item.description) : (item.owner != null ? String(item.owner) : null),
          firstAppearanceChapter:
            typeof item.firstChapter === "number"
              ? item.firstChapter
              : typeof item.chapter === "number"
              ? item.chapter
              : null,
          lastMentionedChapter: upToChapter,
          metadata: Object.keys(item).length > 0 ? item : null,
        });
      }
    }

    if (toInsert.length > 0) {
      await db.insert(bookKnowledgeTable).values(toInsert);
    }

    const entities = await db
      .select()
      .from(bookKnowledgeTable)
      .where(eq(bookKnowledgeTable.bookId, bookId))
      .orderBy(bookKnowledgeTable.entityType, bookKnowledgeTable.name);

    res.json({ entities, extractedFromChapter: upToChapter, analyzedChapters: MAX_TOTAL, totalEntities: entities.length });
  } catch (err) {
    logger.error({ err }, "Falha ao extrair conhecimento do livro");
    res.status(500).json({ error: "Falha ao extrair conhecimento" });
  }
});

export default router;
