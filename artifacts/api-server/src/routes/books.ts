import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, booksTable, chaptersTable, readingProgressTable, chapterSummariesTable, charactersTable } from "@workspace/db";
import {
  CreateBookBody,
  GetBookParams,
  UpdateBookParams,
  UpdateBookBody,
  DeleteBookParams,
  GetBookStatsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function sanitizeImportedContent(content: string): string {
  // Remove any HTML tags to prevent XSS when stored/rendered later
  return content.replace(/<[^>]*>/g, "");
}

function parseChapters(content: string): { chapterNumber: number; title: string | null; content: string }[] {
  // Try to split on common chapter patterns
  const chapterPattern = /(?:^|\n)(Chapter\s+\d+[^\n]*|CHAPTER\s+\d+[^\n]*|\d+\.\s+[^\n]{0,80})/gi;
  const matches = [...content.matchAll(chapterPattern)];

  if (matches.length < 2) {
    // No chapters found — split into ~2000-word chunks
    const words = content.split(/\s+/);
    const CHUNK = 2000;
    const chapters: { chapterNumber: number; title: string | null; content: string }[] = [];
    for (let i = 0; i < words.length; i += CHUNK) {
      chapters.push({
        chapterNumber: chapters.length + 1,
        title: null,
        content: words.slice(i, i + CHUNK).join(" "),
      });
    }
    return chapters.length ? chapters : [{ chapterNumber: 1, title: null, content }];
  }

  const chapters: { chapterNumber: number; title: string | null; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? content.length : content.length;
    const chapterContent = content.slice(start, end).trim();
    if (chapterContent.length > 10) {
      chapters.push({
        chapterNumber: chapters.length + 1,
        title: matches[i][1].trim() || null,
        content: chapterContent,
      });
    }
  }
  return chapters.length ? chapters : [{ chapterNumber: 1, title: null, content }];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// GET /books
router.get("/books", async (_req, res): Promise<void> => {
  const books = await db.select().from(booksTable).orderBy(booksTable.updatedAt);
  res.json(books);
});

// POST /books
router.post("/books", async (req, res): Promise<void> => {
  const parsed = CreateBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { content, title, author, description, tags } = parsed.data;
  const safeContent = sanitizeImportedContent(content);
  const chapters = parseChapters(safeContent);
  const totalWords = chapters.reduce((sum, c) => sum + countWords(c.content), 0);

  const [book] = await db
    .insert(booksTable)
    .values({
      title,
      author: author ?? null,
      description: description ?? null,
      totalChapters: chapters.length,
      totalWords,
      tags: tags ?? [],
      isFavorite: false,
    })
    .returning();

  await db.insert(chaptersTable).values(
    chapters.map((c) => ({
      bookId: book.id,
      chapterNumber: c.chapterNumber,
      title: c.title,
      content: c.content,
      wordCount: countWords(c.content),
    }))
  );

  // Initialize progress
  await db.insert(readingProgressTable).values({
    bookId: book.id,
    currentChapter: 1,
    characterPosition: 0,
    lastReadAt: new Date(),
  });

  res.status(201).json(book);
});

// GET /books/:id
router.get("/books/:id", async (req, res): Promise<void> => {
  const params = GetBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, params.data.id));
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }
  res.json(book);
});

// PATCH /books/:id
router.patch("/books/:id", async (req, res): Promise<void> => {
  const params = UpdateBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.title != null) updateData.title = parsed.data.title;
  if (parsed.data.author !== undefined) updateData.author = parsed.data.author;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.tags != null) updateData.tags = parsed.data.tags;
  if (parsed.data.isFavorite != null) updateData.isFavorite = parsed.data.isFavorite;

  const [book] = await db
    .update(booksTable)
    .set(updateData)
    .where(eq(booksTable.id, params.data.id))
    .returning();

  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }
  res.json(book);
});

// DELETE /books/:id
router.delete("/books/:id", async (req, res): Promise<void> => {
  const params = DeleteBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [book] = await db
    .delete(booksTable)
    .where(eq(booksTable.id, params.data.id))
    .returning();
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }
  res.sendStatus(204);
});

// GET /books/:id/stats
router.get("/books/:id/stats", async (req, res): Promise<void> => {
  const params = GetBookStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, params.data.id));
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  const [progress] = await db
    .select()
    .from(readingProgressTable)
    .where(eq(readingProgressTable.bookId, params.data.id));

  const [charCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(charactersTable)
    .where(eq(charactersTable.bookId, params.data.id));

  const [summaryCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chapterSummariesTable)
    .innerJoin(chaptersTable, eq(chapterSummariesTable.chapterId, chaptersTable.id))
    .where(eq(chaptersTable.bookId, params.data.id));

  const chaptersRead = progress ? progress.currentChapter - 1 : 0;
  const percentComplete = book.totalChapters > 0 ? Math.round((chaptersRead / book.totalChapters) * 100) : 0;

  res.json({
    bookId: params.data.id,
    totalChapters: book.totalChapters,
    totalWords: book.totalWords,
    chaptersRead,
    percentComplete,
    characterCount: charCount?.count ?? 0,
    summaryCount: summaryCount?.count ?? 0,
  });
});

// GET /library/recent
router.get("/library/recent", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: booksTable.id,
      title: booksTable.title,
      author: booksTable.author,
      currentChapter: readingProgressTable.currentChapter,
      totalChapters: booksTable.totalChapters,
      lastReadAt: readingProgressTable.lastReadAt,
      isFavorite: booksTable.isFavorite,
    })
    .from(booksTable)
    .leftJoin(readingProgressTable, eq(booksTable.id, readingProgressTable.bookId))
    .orderBy(readingProgressTable.lastReadAt);

  const result = rows.map((r) => ({
    ...r,
    currentChapter: r.currentChapter ?? 1,
    percentComplete: r.totalChapters > 0
      ? Math.round(((r.currentChapter ?? 1) - 1) / r.totalChapters * 100)
      : 0,
  }));

  res.json(result);
});

export default router;
