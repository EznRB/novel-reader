import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, booksTable, readingProgressTable } from "@workspace/db";
import {
  GetReadingProgressParams,
  UpdateReadingProgressParams,
  UpdateReadingProgressBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /books/:id/progress
router.get("/books/:id/progress", async (req, res): Promise<void> => {
  const params = GetReadingProgressParams.safeParse(req.params);
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

  if (!progress) {
    // Create default progress if missing
    const [created] = await db
      .insert(readingProgressTable)
      .values({
        bookId: params.data.id,
        currentChapter: 1,
        characterPosition: 0,
        lastReadAt: new Date(),
      })
      .returning();
    res.json(created);
    return;
  }

  res.json(progress);
});

// PUT /books/:id/progress
router.put("/books/:id/progress", async (req, res): Promise<void> => {
  const params = UpdateReadingProgressParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateReadingProgressBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(readingProgressTable)
    .where(eq(readingProgressTable.bookId, params.data.id));

  if (!existing) {
    const [created] = await db
      .insert(readingProgressTable)
      .values({
        bookId: params.data.id,
        currentChapter: parsed.data.currentChapter,
        characterPosition: parsed.data.characterPosition,
        lastReadAt: new Date(),
      })
      .returning();
    res.json(created);
    return;
  }

  const [updated] = await db
    .update(readingProgressTable)
    .set({
      currentChapter: parsed.data.currentChapter,
      characterPosition: parsed.data.characterPosition,
      lastReadAt: new Date(),
    })
    .where(eq(readingProgressTable.bookId, params.data.id))
    .returning();

  res.json(updated);
});

export default router;
