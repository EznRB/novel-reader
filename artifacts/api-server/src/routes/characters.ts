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

// Vozes Microsoft Edge pt-BR para personagens masculinos
const MALE_VOICES = [
  "pt-BR-AntonioNeural",    // protagonista masculino — neutro e claro
  "pt-BR-DonatoNeural",     // antagonista — grave e sério
  "pt-BR-FabioNeural",      // personagem de apoio
  "pt-BR-FranciscoNeural",  // personagem jovem
  "pt-BR-HumbertoNeural",   // personagem veterano/idoso
  "pt-BR-JulioNeural",      // personagem secundário
];

// Vozes Microsoft Edge pt-BR para personagens femininas
const FEMALE_VOICES = [
  "pt-BR-FranciscaNeural",  // protagonista feminina — neutra e clara
  "pt-BR-BrendaNeural",     // personagem de apoio
  "pt-BR-ElzaNeural",       // personagem veterana/séria
  "pt-BR-GiovannaNeural",   // personagem jovem e animada
  "pt-BR-LeticiaNeural",    // personagem misteriosa
  "pt-BR-ManuelaNeural",    // personagem secundária
];

// Voz fixa do narrador
const NARRATOR_VOICE = "pt-BR-AntonioNeural";

// GET /books/:id/characters
router.get("/books/:id/characters", async (req, res): Promise<void> => {
  const params = ListCharactersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, params.data.id));
  if (!book) {
    res.status(404).json({ error: "Livro não encontrado" });
    return;
  }

  const characters = await db
    .select()
    .from(charactersTable)
    .where(eq(charactersTable.bookId, params.data.id))
    .orderBy(charactersTable.firstAppearanceChapter, charactersTable.name);

  res.json(characters);
});

// POST /books/:id/characters  (extração via IA)
router.post("/books/:id/characters", async (req, res): Promise<void> => {
  const params = ExtractCharactersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, params.data.id));
  if (!book) {
    res.status(404).json({ error: "Livro não encontrado" });
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

  // Estratégia de extração precisa:
  // - Primeiros 30 capítulos (onde a maioria dos personagens é apresentada): 800 chars cada
  // - Capítulos 31-60: 400 chars cada
  // Total: ~20k chars, com marcadores claros de capítulo
  const MAX_EARLY = 30;
  const MAX_TOTAL = 60;
  const relevantChapters = chapters.filter((c) => c.chapterNumber <= Math.min(upToChapter, MAX_TOTAL));

  const combinedText = relevantChapters
    .map((c) => {
      const budget = c.chapterNumber <= MAX_EARLY ? 800 : 400;
      return `[CAPÍTULO ${c.chapterNumber}]:\n${c.content.slice(0, budget)}`;
    })
    .join("\n\n---\n\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1800,
      messages: [
        {
          role: "system",
          content: `Você é um analista literário especializado em romances de fantasia e ficção científica. Extraia os personagens nomeados do texto fornecido.

REGRAS CRÍTICAS:
1. O campo "firstAppearanceChapter" DEVE ser exatamente o número N do marcador [CAPÍTULO N] onde o personagem aparece pela PRIMEIRA VEZ no texto. Jamais invente números de capítulos que não estão no texto.
2. Use apenas capítulos presentes no texto fornecido.
3. Infira o gênero pelos pronomes e pelo contexto (ele/seu/dele = male, ela/sua/dela = female).
4. Inclua apenas personagens claramente nomeados com papéis significativos.
5. Responda APENAS com JSON válido, sem markdown.

Retorne um array JSON com esta estrutura:
[
  {
    "name": "Nome do Personagem",
    "description": "Descrição de 2-3 frases sobre o personagem, seu papel e personalidade",
    "role": "protagonist|antagonist|supporting|minor",
    "gender": "male|female|unknown",
    "firstAppearanceChapter": 1
  }
]`,
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
      logger.warn("Falha ao parsear JSON de extração de personagens");
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
    logger.error({ err }, "Falha ao extrair personagens");
    res.status(500).json({ error: "Falha ao extrair personagens" });
  }
});

// POST /books/:id/characters/assign-voices  (atribuição de vozes via IA)
router.post("/books/:id/characters/assign-voices", async (req, res): Promise<void> => {
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

  const characters = await db
    .select()
    .from(charactersTable)
    .where(eq(charactersTable.bookId, bookId));

  if (characters.length === 0) {
    res.json({ characters: [], message: "Nenhum personagem encontrado — extraia os personagens primeiro" });
    return;
  }

  const charList = characters
    .map((c) => `ID ${c.id}: ${c.name} | papel: ${c.role ?? "desconhecido"} | gênero: ${c.gender ?? "desconhecido"} | descrição: ${c.description ?? "sem descrição"}`)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 900,
      messages: [
        {
          role: "system",
          content: `Você é um diretor de casting para audiolivros em português. Atribua a melhor voz Microsoft Edge Neural (pt-BR) para cada personagem.

VOZES MASCULINAS pt-BR disponíveis: ${MALE_VOICES.join(", ")}
VOZES FEMININAS pt-BR disponíveis: ${FEMALE_VOICES.join(", ")}
Narrador/padrão: ${NARRATOR_VOICE}

REGRAS DE ATRIBUIÇÃO:
- Use o gênero do personagem para escolher vozes masculinas ou femininas
- Protagonista: primeira voz da lista (mais neutra/clara) — NUNCA a mesma que o narrador
- Antagonista masculino: pt-BR-DonatoNeural (grave e sério)
- Personagens jovens masculinos: pt-BR-FranciscoNeural
- Personagens veteranos/idosos masculinos: pt-BR-HumbertoNeural
- Antagonista feminina: pt-BR-ElzaNeural
- Personagens jovens femininas: pt-BR-GiovannaNeural
- Cada personagem PRINCIPAL deve ter uma voz ÚNICA
- Personagens menores podem compartilhar vozes
- NÃO atribua ${NARRATOR_VOICE} a nenhum personagem (essa é a voz exclusiva do narrador)

Retorne um array JSON — uma entrada por ID de personagem:
[{"id": 1, "assignedVoice": "pt-BR-AntonioNeural", "gender": "male"}]
Retorne APENAS JSON válido.`,
        },
        {
          role: "user",
          content: `Livro: "${book.title}"\n\nPersonagens:\n${charList}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    let assignments: { id: number; assignedVoice: string; gender?: string }[] = [];

    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) assignments = JSON.parse(jsonMatch[0]);
    } catch {
      logger.warn("Falha ao parsear JSON de atribuição de vozes");
    }

    // Aplica atribuições — nunca usa a voz do narrador em personagens
    for (const assignment of assignments) {
      if (!assignment.id || !assignment.assignedVoice) continue;
      const voice = assignment.assignedVoice === NARRATOR_VOICE
        ? (assignment.gender === "female" ? FEMALE_VOICES[0] : MALE_VOICES[1])
        : assignment.assignedVoice;
      await db
        .update(charactersTable)
        .set({
          assignedVoice: voice,
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
    logger.error({ err }, "Falha ao atribuir vozes");
    res.status(500).json({ error: "Falha ao atribuir vozes" });
  }
});

export default router;
