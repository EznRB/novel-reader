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

// Available Microsoft Edge voices for character assignment
const MALE_VOICES = [
  "en-US-GuyNeural",
  "en-US-BrianNeural",
  "en-US-JasonNeural",
  "en-US-RogerNeural",
  "en-US-TonyNeural",
  "en-US-DavisNeural",
];

const FEMALE_VOICES = [
  "en-US-AriaNeural",
  "en-US-JennyNeural",
  "en-US-MichelleNeural",
  "en-US-MonicaNeural",
  "en-US-SaraNeural",
  "en-US-NancyNeural",
];

const NARRATOR_VOICE = "en-US-AndrewNeural";

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

// POST /books/:id/characters  (AI extraction)
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
      max_completion_tokens: 1500,
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
    "gender": "male|female|unknown",
    "firstAppearanceChapter": 1
  }
]
Only include characters that are clearly named and have meaningful roles.
Infer gender from pronouns, names, and context.
Return valid JSON only.`,
        },
        {
          role: "user",
          content: combinedText,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "[]";
    let extracted: {
      name: string;
      description?: string;
      role?: string;
      gender?: string;
      firstAppearanceChapter?: number;
    }[] = [];

    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
    } catch {
      logger.warn("Failed to parse character extraction JSON");
    }

    await db.delete(charactersTable).where(eq(charactersTable.bookId, params.data.id));

    if (extracted.length > 0) {
      await db.insert(charactersTable).values(
        extracted.map((c) => ({
          bookId: params.data.id,
          name: c.name,
          description: c.description ?? null,
          role: c.role ?? null,
          gender: c.gender ?? null,
          firstAppearanceChapter: c.firstAppearanceChapter ?? null,
          assignedVoice: null,
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

// POST /books/:id/characters/assign-voices  (AI voice assignment)
router.post("/books/:id/characters/assign-voices", async (req, res): Promise<void> => {
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

  const characters = await db
    .select()
    .from(charactersTable)
    .where(eq(charactersTable.bookId, bookId));

  if (characters.length === 0) {
    res.json({ characters: [], message: "No characters found — extract characters first" });
    return;
  }

  const charList = characters
    .map((c) => `ID ${c.id}: ${c.name} | role: ${c.role ?? "unknown"} | gender: ${c.gender ?? "unknown"} | description: ${c.description ?? "no description"}`)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 800,
      messages: [
        {
          role: "system",
          content: `You are a voice casting director for audiobooks. Assign the best Microsoft Edge neural voice to each character.

Available male voices: ${MALE_VOICES.join(", ")}
Available female voices: ${FEMALE_VOICES.join(", ")}
Narrator/default: ${NARRATOR_VOICE}

Assignment rules:
- Use gender to pick male/female voice pool
- Protagonist: first voice in their pool (most neutral/clear)
- Antagonist: a deeper/darker voice (GuyNeural for male, MonicaNeural for female)
- Young characters: lighter voices (BrianNeural, SaraNeural)
- Veteran/old characters: deeper voices (RogerNeural, NancyNeural)
- Each important character should get a UNIQUE voice
- Minor characters can share voices

Return a JSON array — one entry per character ID:
[{"id": 1, "assignedVoice": "en-US-GuyNeural", "gender": "male"}]
Return valid JSON only.`,
        },
        {
          role: "user",
          content: `Book: "${book.title}"\n\nCharacters:\n${charList}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    let assignments: { id: number; assignedVoice: string; gender?: string }[] = [];

    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) assignments = JSON.parse(jsonMatch[0]);
    } catch {
      logger.warn("Failed to parse voice assignment JSON");
    }

    // Apply assignments
    for (const assignment of assignments) {
      if (!assignment.id || !assignment.assignedVoice) continue;
      await db
        .update(charactersTable)
        .set({
          assignedVoice: assignment.assignedVoice,
          gender: assignment.gender ?? null,
        })
        .where(eq(charactersTable.id, assignment.id));
    }

    const updated = await db
      .select()
      .from(charactersTable)
      .where(eq(charactersTable.bookId, bookId))
      .orderBy(charactersTable.firstAppearanceChapter);

    res.json({ characters: updated, narratorVoice: NARRATOR_VOICE });
  } catch (err) {
    logger.error({ err }, "Failed to assign character voices");
    res.status(500).json({ error: "Failed to assign character voices" });
  }
});

export default router;
