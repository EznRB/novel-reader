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
      quickSummary: existing.quickSummary ?? null,
      charactersPresent: (existing.charactersPresent as string[] | null) ?? null,
      keyEvents: (existing.keyEvents as string[] | null) ?? null,
      revelations: (existing.revelations as string[] | null) ?? null,
      powerChanges: (existing.powerChanges as string[] | null) ?? null,
      createdAt: existing.createdAt,
    });
    return;
  }

  // Generate AI summary — structured format
  const contentSnippet = chapter.content.slice(0, 12000);
  const chapterLabel = `Chapter ${params.data.chapterNumber}${chapter.title ? ` — ${chapter.title}` : ""}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 900,
      messages: [
        {
          role: "system",
          content: `You are a literary assistant specializing in story analysis. Analyze the chapter and return a JSON object.

Return ONLY valid JSON with this exact structure:
{
  "quickSummary": "2-3 sentence summary for quick review",
  "fullSummary": "Detailed 2-4 paragraph summary covering plot events, character development, and revelations",
  "charactersPresent": ["Name1", "Name2"],
  "keyEvents": ["Event description 1", "Event description 2"],
  "revelations": ["New discovery or plot twist revealed"],
  "powerChanges": ["Character X acquired skill Y", "Character Z evolved power"]
}

Rules:
- quickSummary: 2-3 sentences maximum, no spoilers beyond this chapter
- fullSummary: detailed but focused on THIS chapter only
- charactersPresent: only named characters who appear in this chapter
- keyEvents: most important plot events, be specific
- revelations: new information revealed to the reader/protagonist
- powerChanges: new skills, abilities, level-ups, evolutions (empty array if none)
Return valid JSON only — no markdown.`,
        },
        {
          role: "user",
          content: `${chapterLabel}:\n\n${contentSnippet}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: {
      quickSummary?: string;
      fullSummary?: string;
      charactersPresent?: string[];
      keyEvents?: string[];
      revelations?: string[];
      powerChanges?: string[];
    } = {};

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      logger.warn("Failed to parse structured summary JSON — falling back to plain text");
      parsed = { fullSummary: raw };
    }

    const summary = parsed.fullSummary ?? parsed.quickSummary ?? raw;
    const quickSummary = parsed.quickSummary ?? null;
    const charactersPresent = Array.isArray(parsed.charactersPresent) ? parsed.charactersPresent : null;
    const keyEvents = Array.isArray(parsed.keyEvents) ? parsed.keyEvents : null;
    const revelations = Array.isArray(parsed.revelations) ? parsed.revelations : null;
    const powerChanges = Array.isArray(parsed.powerChanges) && parsed.powerChanges.length > 0 ? parsed.powerChanges : null;

    const [saved] = await db
      .insert(chapterSummariesTable)
      .values({
        chapterId: chapter.id,
        summary,
        quickSummary,
        charactersPresent,
        keyEvents,
        revelations,
        powerChanges,
      })
      .returning();

    res.json({
      id: saved.id,
      chapterId: saved.chapterId,
      chapterNumber: params.data.chapterNumber,
      summary: saved.summary,
      quickSummary: saved.quickSummary ?? null,
      charactersPresent: (saved.charactersPresent as string[] | null) ?? null,
      keyEvents: (saved.keyEvents as string[] | null) ?? null,
      revelations: (saved.revelations as string[] | null) ?? null,
      powerChanges: (saved.powerChanges as string[] | null) ?? null,
      createdAt: saved.createdAt,
    });
  } catch (err) {
    logger.error({ err }, "Failed to generate chapter summary");
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

export default router;
