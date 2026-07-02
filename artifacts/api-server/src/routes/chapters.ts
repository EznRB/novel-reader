import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, booksTable, chaptersTable, chapterSummariesTable } from "@workspace/db";
import {
  ListChaptersParams,
  GetChapterParams,
  GetChapterSummaryParams,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { withRateLimit } from "../../../lib/integrations-openai-ai-server/src/rateLimiter";
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
    res.status(404).json({ error: "Livro não encontrado" });
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
    res.status(404).json({ error: "Capítulo não encontrado" });
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
    res.status(404).json({ error: "Capítulo não encontrado" });
    return;
  }

  // Retorna resumo em cache se existir
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

  // Gera resumo via IA — formato estruturado em português
  const contentSnippet = chapter.content.slice(0, 12000);
  const chapterLabel = `Capítulo ${params.data.chapterNumber}${chapter.title ? ` — ${chapter.title}` : ""}`;

  try {
    const completion = await withRateLimit(() => openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1100,
      messages: [
        {
          role: "system",
          content: `Você é um assistente literário especializado em análise de histórias. Analise o capítulo e retorne um objeto JSON.

IMPORTANTE: Responda SEMPRE em Português do Brasil (pt-BR). Todos os textos nos campos devem ser em português.

Retorne APENAS um JSON válido com esta estrutura exata:
{
  "quickSummary": "Resumo de 2-3 frases para revisão rápida",
  "fullSummary": "Resumo detalhado em 2-4 parágrafos cobrindo eventos do enredo, desenvolvimento de personagens e revelações",
  "charactersPresent": ["Nome1", "Nome2"],
  "keyEvents": ["Descrição do evento 1", "Descrição do evento 2"],
  "revelations": ["Nova descoberta ou reviravolta revelada"],
  "powerChanges": ["Personagem X adquiriu habilidade Y", "Personagem Z evoluiu poder"]
}

Regras:
- quickSummary: máximo 2-3 frases, sem spoilers além deste capítulo
- fullSummary: detalhado mas focado SOMENTE neste capítulo
- charactersPresent: apenas personagens nomeados que aparecem neste capítulo
- keyEvents: eventos mais importantes do enredo, seja específico
- revelations: novas informações reveladas ao leitor/protagonista
- powerChanges: novas habilidades, evoluções de poder, up de nível (array vazio se nenhum)
- Use os nomes dos personagens como aparecem no texto original
Retorne APENAS JSON válido — sem markdown.`,
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
      logger.warn("Falha ao parsear JSON do resumo estruturado — fallback para texto simples");
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
    logger.error({ err }, "Falha ao gerar resumo do capítulo");
    res.status(500).json({ error: "Falha ao gerar resumo" });
  }
});

export default router;
