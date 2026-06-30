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
    res.status(400).json({ error: "Invalid book ID" });
    return;
  }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, bookId));
  if (!book) {
    res.status(404).json({ error: "Book not found" });
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
    res.status(400).json({ error: "Invalid book ID" });
    return;
  }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, bookId));
  if (!book) {
    res.status(404).json({ error: "Book not found" });
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

  const combinedText = chapters
    .map((c) => `=== ${c.title ?? `Chapter ${c.chapterNumber}`} ===\n${c.content.slice(0, 2000)}`)
    .join("\n\n")
    .slice(0, 20000);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 2500,
      messages: [
        {
          role: "system",
          content: `You are a world-building analyst for novels. Extract ALL named entities from the story.
Return ONLY a valid JSON object with these arrays (include only entities that clearly appear in the text):
{
  "characters": [{"name": "Full Name", "description": "role and personality in 1-2 sentences", "firstChapter": 1}],
  "organizations": [{"name": "Name", "description": "what kind of organization"}],
  "factions": [{"name": "Name", "description": "alignment and goals"}],
  "locations": [{"name": "Name", "description": "what kind of place and its significance"}],
  "skills": [{"name": "Skill/Ability/Power Name", "owner": "Character Name", "description": "what it does"}],
  "artifacts": [{"name": "Item Name", "owner": "Character Name or unknown", "description": "what it is and its power"}],
  "events": [{"description": "Important event in 1 sentence", "chapter": 1, "importance": "high|medium|low"}]
}
Be thorough but concise. Return ONLY valid JSON — no markdown, no explanation.`,
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
      logger.warn("Failed to parse knowledge extraction JSON");
    }

    // Clear existing and re-insert
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

    res.json({ entities, extractedFromChapter: upToChapter, totalEntities: entities.length });
  } catch (err) {
    logger.error({ err }, "Failed to extract knowledge");
    res.status(500).json({ error: "Failed to extract knowledge" });
  }
});

export default router;
