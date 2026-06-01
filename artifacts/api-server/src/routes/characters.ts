import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, booksTable, chaptersTable, charactersTable, readingProgressTable } from "@workspace/db";
import {
  ListCharactersParams,
  ExtractCharactersParams,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /books/:id/characters
router.get("/books/:id/characters", async (req, res): Promise<void> => {
  const params = ListCharactersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, params.data.id));
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  const characters = await db
    .select()
    .from(charactersTable)
    .where(eq(charactersTable.bookId, params.data.id))
    .orderBy(charactersTable.firstAppearanceChapter, charactersTable.name);

  res.json(characters);
});

// POST /books/:id/characters (AI extraction)
router.post("/books/:id/characters", async (req, res): Promise<void> => {
  const params = ExtractCharactersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, params.data.id));
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  // Get chapters read so far
  const [progress] = await db
    .select()
    .from(readingProgressTable)
    .where(eq(readingProgressTable.bookId, params.data.id));

  const upToChapter = progress?.currentChapter ?? book.totalChapters;

  const chapters = await db
    .select({ chapterNumber: chaptersTable.chapterNumber, content: chaptersTable.content })
    .from(chaptersTable)
    .where(eq(chaptersTable.bookId, params.data.id))
    .orderBy(chaptersTable.chapterNumber);

  const relevantChapters = chapters.filter((c) => c.chapterNumber <= upToChapter);
  const combinedText = relevantChapters
    .map((c) => `Chapter ${c.chapterNumber}: ${c.content.slice(0, 3000)}`)
    .join("\n\n")
    .slice(0, 15000);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1200,
      messages: [
        {
          role: "system",
          content: `You are a literary analyst. Extract characters from the provided novel text.
Return a JSON array of objects with this structure:
[
  {
    "name": "Character Name",
    "description": "2-3 sentence description of the character",
    "role": "protagonist|antagonist|supporting|minor",
    "firstAppearanceChapter": 1
  }
]
Only include characters that are clearly named and have meaningful roles. Return valid JSON only.`,
        },
        {
          role: "user",
          content: combinedText,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "[]";
    let extracted: { name: string; description?: string; role?: string; firstAppearanceChapter?: number }[] = [];

    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      }
    } catch {
      logger.warn("Failed to parse character extraction JSON");
    }

    // Clear old characters and insert new ones
    await db.delete(charactersTable).where(eq(charactersTable.bookId, params.data.id));

    if (extracted.length > 0) {
      await db.insert(charactersTable).values(
        extracted.map((c) => ({
          bookId: params.data.id,
          name: c.name,
          description: c.description ?? null,
          role: c.role ?? null,
          firstAppearanceChapter: c.firstAppearanceChapter ?? null,
        }))
      );
    }

    const characters = await db
      .select()
      .from(charactersTable)
      .where(eq(charactersTable.bookId, params.data.id))
      .orderBy(charactersTable.firstAppearanceChapter);

    res.json(characters);
  } catch (err) {
    logger.error({ err }, "Failed to extract characters");
    res.status(500).json({ error: "Failed to extract characters" });
  }
});

export default router;
