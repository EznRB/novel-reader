import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, booksTable, chaptersTable, charactersTable, readingProgressTable } from "@workspace/db";
import {
  ListCharactersParams,
  ExtractCharactersParams,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { withRateLimit } from "../../../lib/integrations-openai-ai-server/src/rateLimiter";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ──────────────────────────────────────────────────────
//  Sistema de vozes pt-BR — 3 camadas de personagens
// ──────────────────────────────────────────────────────

/** Voz exclusiva do narrador — nunca atribuída a personagens */
const NARRATOR_VOICE = "pt-BR-AntonioNeural";

/**
 * Pool de vozes únicas para PERSONAGENS PRINCIPAIS.
 * Cada personagem principal recebe uma voz exclusiva e permanente.
 * Protagonistas/antagonistas recebem vozes desse pool.
 */
const MAIN_MALE_VOICES   = ["pt-BR-DonatoNeural", "pt-BR-FranciscoNeural", "pt-BR-JulioNeural", "pt-BR-HumbertoNeural"];
const MAIN_FEMALE_VOICES = ["pt-BR-FranciscaNeural", "pt-BR-BrendaNeural", "pt-BR-ElzaNeural", "pt-BR-ManuelaNeural"];

/**
 * Voz compartilhada para PERSONAGENS SECUNDÁRIOS E FIGURANTES.
 * Todos os personagens desse tier compartilham uma voz por gênero.
 */
const DEFAULT_MALE_VOICE   = "pt-BR-FabioNeural";
const DEFAULT_FEMALE_VOICE = "pt-BR-GiovannaNeural";
const DEFAULT_UNKNOWN_VOICE = "pt-BR-FabioNeural";

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

// POST /books/:id/characters  (extração via IA com análise toda a obra)
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

  // Estratégia de orçamento por capítulo para máxima precisão:
  // - Primeiros 30 capítulos (onde maioria dos personagens é introduzida): 800 chars
  // - Capítulos 31-60: 400 chars
  const MAX_EARLY = 30;
  const MAX_TOTAL = Math.min(upToChapter, 60);
  const relevantChapters = chapters.filter((c) => c.chapterNumber <= MAX_TOTAL);

  const combinedText = relevantChapters
    .map((c) => {
      const budget = c.chapterNumber <= MAX_EARLY ? 800 : 400;
      return `[CAPÍTULO ${c.chapterNumber}]:\n${c.content.slice(0, budget)}`;
    })
    .join("\n\n---\n\n");

  try {
    const completion = await withRateLimit(() => openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `Você é um analista literário. Extraia os personagens nomeados do texto.

REGRAS CRÍTICAS DE CLASSIFICAÇÃO DE PAPEL:
- "protagonist": APENAS o(a) protagonista principal da história (normalmente 1, raramente 2). É o foco narrativo central.
- "antagonist": Principais opositores com papel significativo e recorrente (1-3 no máximo).
- "supporting": Personagens recorrentes que aparecem em múltiplos capítulos com papel ativo na trama.
- "minor": Todos os demais — mencionados ocasionalmente, aparecem em poucos capítulos, ou têm papel passageiro.
- "firstAppearanceChapter": EXATAMENTE o número N do marcador [CAPÍTULO N] onde o personagem aparece pela PRIMEIRA VEZ.

Classifique de forma CONSERVADORA — poucos protagonistas/antagonistas, maioria como supporting/minor.

Retorne APENAS JSON válido sem markdown:
[
  {
    "name": "Nome",
    "description": "Papel e personalidade em 2-3 frases",
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
          role: c.role ?? "minor",
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

// POST /books/:id/characters/assign-voices  (sistema automático de 3 camadas)
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
    .where(eq(charactersTable.bookId, bookId))
    .orderBy(charactersTable.firstAppearanceChapter);

  if (characters.length === 0) {
    res.json({ characters: [], narratorVoice: NARRATOR_VOICE, message: "Nenhum personagem para atribuir vozes" });
    return;
  }

  // ── Sistema de 3 camadas ──────────────────────────────────────────
  //
  // Camada 1 — Personagens PRINCIPAIS (protagonist + antagonist)
  //   → Voz exclusiva e permanente do pool de vozes únicas
  //
  // Camada 2 — Personagens SECUNDÁRIOS (supporting)
  //   → Voz compartilhada por gênero: DEFAULT_MALE/DEFAULT_FEMALE
  //
  // Camada 3 — FIGURANTES (minor + unknown)
  //   → Mesma voz padrão compartilhada por gênero
  //
  // Narrador: NARRATOR_VOICE (nunca atribuído a personagens)
  // ─────────────────────────────────────────────────────────────────

  const usedMaleVoices   = new Set<string>();
  const usedFemaleVoices = new Set<string>();

  const getNextMainMale = (): string => {
    for (const v of MAIN_MALE_VOICES) {
      if (!usedMaleVoices.has(v)) {
        usedMaleVoices.add(v);
        return v;
      }
    }
    return DEFAULT_MALE_VOICE;
  };

  const getNextMainFemale = (): string => {
    for (const v of MAIN_FEMALE_VOICES) {
      if (!usedFemaleVoices.has(v)) {
        usedFemaleVoices.add(v);
        return v;
      }
    }
    return DEFAULT_FEMALE_VOICE;
  };

  const assignments: { id: number; voice: string; tier: string }[] = [];

  for (const char of characters) {
    const role   = char.role ?? "minor";
    const gender = (char.gender ?? "unknown").toLowerCase();
    const isMain = role === "protagonist" || role === "antagonist";

    let voice: string;

    if (isMain) {
      // Personagem PRINCIPAL — voz exclusiva
      if (gender === "female") {
        voice = getNextMainFemale();
      } else {
        // male ou unknown → voz masculina
        voice = getNextMainMale();
      }
    } else {
      // Personagem SECUNDÁRIO ou FIGURANTE — voz compartilhada
      if (gender === "female") {
        voice = DEFAULT_FEMALE_VOICE;
      } else if (gender === "male") {
        voice = DEFAULT_MALE_VOICE;
      } else {
        voice = DEFAULT_UNKNOWN_VOICE;
      }
    }

    // Nunca atribui a voz do narrador a um personagem
    if (voice === NARRATOR_VOICE) {
      voice = gender === "female" ? DEFAULT_FEMALE_VOICE : DEFAULT_MALE_VOICE;
    }

    assignments.push({ id: char.id, voice, tier: isMain ? "main" : role === "supporting" ? "secondary" : "extra" });
  }

  // Persiste as atribuições no banco
  for (const { id, voice } of assignments) {
    await db
      .update(charactersTable)
      .set({ assignedVoice: voice })
      .where(eq(charactersTable.id, id));
  }

  const updated = await db
    .select()
    .from(charactersTable)
    .where(eq(charactersTable.bookId, bookId))
    .orderBy(charactersTable.firstAppearanceChapter);

  // Resumo para o toast
  const mainCount      = assignments.filter((a) => a.tier === "main").length;
  const secondaryCount = assignments.filter((a) => a.tier === "secondary").length;
  const extraCount     = assignments.filter((a) => a.tier === "extra").length;

  res.json({
    characters: updated,
    narratorVoice: NARRATOR_VOICE,
    summary: {
      main: mainCount,
      secondary: secondaryCount,
      extra: extraCount,
    },
  });
});

export default router;
