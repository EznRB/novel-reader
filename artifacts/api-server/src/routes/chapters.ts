import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, booksTable, chaptersTable, chapterSummariesTable } from "@workspace/db";
import {
  ListChaptersParams,
  GetChapterParams,
  GetChapterSummaryParams,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /books/:id/chapters
router.get("/books/:id/chapters", async (req, res): Promise<void> => {
  const params = ListChaptersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, params.data.id));
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  const chapters = await db
    .select()
    .from(chaptersTable)
    .where(eq(chaptersTable.bookId, params.data.id))
    .orderBy(chaptersTable.chapterNumber);

  res.json(chapters);
});

// GET /books/:id/chapters/:chapterNumber
router.get("/books/:id/chapters/:chapterNumber", async (req, res): Promise<void> => {
  const params = GetChapterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [chapter] = await db
    .select()
    .from(chaptersTable)
    .where(
      and(
        eq(chaptersTable.bookId, params.data.id),
        eq(chaptersTable.chapterNumber, params.data.chapterNumber)
      )
    );

  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  res.json(chapter);
});

// GET /books/:id/chapters/:chapterNumber/summary
router.get("/books/:id/chapters/:chapterNumber/summary", async (req, res): Promise<void> => {
  const params = GetChapterSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [chapter] = await db
    .select()
    .from(chaptersTable)
    .where(
      and(
        eq(chaptersTable.bookId, params.data.id),
        eq(chaptersTable.chapterNumber, params.data.chapterNumber)
      )
    );

  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  // Return cached summary if exists
  const [existing] = await db
    .select()
    .from(chapterSummariesTable)
    .where(eq(chapterSummariesTable.chapterId, chapter.id));

  if (existing) {
    res.json({
      id: existing.id,
      chapterId: existing.chapterId,
      chapterNumber: params.data.chapterNumber,
      summary: existing.summary,
      createdAt: existing.createdAt,
    });
    return;
  }

  // Generate AI summary
  const contentSnippet = chapter.content.slice(0, 12000);
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 500,
      messages: [
        {
          role: "system",
          content: "You are a literary assistant. Write a concise 2-4 paragraph summary of the chapter provided. Focus on key plot events, character developments, and important revelations. Be specific but spoiler-aware — only include what happens in this chapter.",
        },
        {
          role: "user",
          content: `Chapter ${params.data.chapterNumber}${chapter.title ? ` — ${chapter.title}` : ""}:\n\n${contentSnippet}`,
        },
      ],
    });

    const summary = completion.choices[0]?.message?.content ?? "Summary unavailable.";

    const [saved] = await db
      .insert(chapterSummariesTable)
      .values({ chapterId: chapter.id, summary })
      .returning();

    res.json({
      id: saved.id,
      chapterId: saved.chapterId,
      chapterNumber: params.data.chapterNumber,
      summary: saved.summary,
      createdAt: saved.createdAt,
    });
  } catch (err) {
    logger.error({ err }, "Failed to generate chapter summary");
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

export default router;
