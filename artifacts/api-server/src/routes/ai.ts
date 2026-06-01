import { Router, type IRouter } from "express";
import { and, eq, lte } from "drizzle-orm";
import { db, booksTable, chaptersTable, readingProgressTable } from "@workspace/db";
import {
  AskAboutBookParams,
  AskAboutBookBody,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// POST /books/:id/ask
router.post("/books/:id/ask", async (req, res): Promise<void> => {
  const params = AskAboutBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AskAboutBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, params.data.id));
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  // Determine up to which chapter to include
  let upToChapter = parsed.data.upToChapter ?? null;
  if (!upToChapter) {
    const [progress] = await db
      .select()
      .from(readingProgressTable)
      .where(eq(readingProgressTable.bookId, params.data.id));
    upToChapter = progress?.currentChapter ?? book.totalChapters;
  }

  const chapters = await db
    .select({ chapterNumber: chaptersTable.chapterNumber, content: chaptersTable.content, title: chaptersTable.title })
    .from(chaptersTable)
    .where(
      and(
        eq(chaptersTable.bookId, params.data.id),
        lte(chaptersTable.chapterNumber, upToChapter)
      )
    )
    .orderBy(chaptersTable.chapterNumber);

  const context = chapters
    .map((c) => `Chapter ${c.chapterNumber}${c.title ? ` — ${c.title}` : ""}:\n${c.content.slice(0, 4000)}`)
    .join("\n\n---\n\n")
    .slice(0, 20000);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 800,
      messages: [
        {
          role: "system",
          content: `You are a knowledgeable literary assistant helping a reader understand a novel called "${book.title}"${book.author ? ` by ${book.author}` : ""}.
You have access to chapters 1 through ${upToChapter} of the story.
Answer questions based ONLY on the text provided. If something hasn't been revealed yet, say so.
Do not speculate or invent information beyond what is in the text.`,
        },
        {
          role: "user",
          content: `Context (chapters 1-${upToChapter}):\n\n${context}\n\n---\n\nQuestion: ${parsed.data.question}`,
        },
      ],
    });

    const answer = completion.choices[0]?.message?.content ?? "I couldn't generate an answer.";

    res.json({
      question: parsed.data.question,
      answer,
      upToChapter,
    });
  } catch (err) {
    logger.error({ err }, "Failed to answer book question");
    res.status(500).json({ error: "Failed to generate answer" });
  }
});

export default router;
