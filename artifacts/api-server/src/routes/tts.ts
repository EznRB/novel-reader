/* TTS routes – simplified implementation */
// @ts-nocheck
import { Router, type IRouter } from "express";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import { join, resolve } from "path";
import { logger } from "../lib/logger";
// @ts-ignore
import { MsEdgeTTS } from "msedge-tts";

const router: IRouter = Router();

export const NARRATOR_VOICE = "pt-BR-AntonioNeural";

const STYLE_PROSODY: Record<string, { rateDelta: number; pitch: string; volume?: string }> = {
  narration: { rateDelta: 0, pitch: "+0Hz" },
  dialogue: { rateDelta: 8, pitch: "+3Hz" },
  cheerful: { rateDelta: 12, pitch: "+8Hz", volume: "+10%" },
  sad: { rateDelta: -18, pitch: "-5Hz", volume: "-5%" },
  excited: { rateDelta: 20, pitch: "+12Hz", volume: "+15%" },
  angry: { rateDelta: 10, pitch: "-6Hz", volume: "+12%" },
  whisper: { rateDelta: -28, pitch: "-4Hz", volume: "-12%" },
};

/** Clean text before sending to TTS – keep under service limits */
function sanitizeText(text: string): string {
  return text
    .trim()
    .replace(/["\"]/g, '"')
    .replace(/[\'\']/g, "'")
    .replace(/—/g, " - ")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .substring(0, 4800);
}

function getCachePath(key: string): string {
  const base = resolve(process.cwd(), "cache", "tts");
  return join(base, `${key}.mp3`);
}

// GET /tts/voices – list available Edge TTS voices (fallback implementation)
router.get("/tts/voices", async (_req, res): Promise<void> => {
  try {
    const tts = new MsEdgeTTS();
    const voices = await tts.getVoices();
    res.json(voices);
  } catch (err) {
    logger.error({ err }, "Failed to fetch TTS voices");
    res.status(500).json({ error: "Falha ao buscar vozes" });
  }
});

/** POST /tts/batch – synthesize an array of sentences, concatenate, cache on disk. */
router.post("/tts/batch", async (req, res): Promise<void> => {
  const { sentences, voice = NARRATOR_VOICE, rate = 0, style = "narration" } = req.body as {
    sentences?: string[];
    voice?: string;
    rate?: number;
    style?: string;
  };

  if (!Array.isArray(sentences) || sentences.length === 0) {
    res.status(400).json({ error: "sentences array is required" });
    return;
  }

  const cleanSentences = sentences.map(sanitizeText);
  const prosody = STYLE_PROSODY[style] ?? STYLE_PROSODY.narration;
  const totalRate = Math.max(-80, Math.min(100, (Number(rate) || 0) + prosody.rateDelta));
  const rateStr = `${totalRate >= 0 ? "+" : ""}${totalRate}%`;
  const options: Record<string, string> = { rate: rateStr, pitch: prosody.pitch };
  if (prosody.volume) options.volume = prosody.volume;

  const cacheKey = createHash("sha256")
    .update(voice)
    .update(JSON.stringify(cleanSentences))
    .update(JSON.stringify(options))
    .digest("hex");
  const cachePath = getCachePath(cacheKey);

  // Serve from cache if present
  try {
    const cached = await fs.readFile(cachePath);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", cached.length);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(cached);
    return;
  } catch {}

  // Generate audio sequentially using Edge TTS (no experimental provider used)
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, "audio_24khz_96kbitrate_mono_mp3");
  const buffers: Buffer[] = [];
  for (const sentence of cleanSentences) {
    const { audioStream } = tts.toStream(sentence, options);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("TTS stream timeout")), 30000);
      audioStream.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      audioStream.on("end", () => { clearTimeout(timeout); resolve(); });
      audioStream.on("error", (e) => { clearTimeout(timeout); reject(e); });
    });
    buffers.push(Buffer.concat(chunks));
  }
  const combined = Buffer.concat(buffers);
  // Save cache
  await fs.mkdir(resolve(cachePath, ".."), { recursive: true });
  await fs.writeFile(cachePath, combined);

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Length", combined.length);
  res.setHeader("Cache-Control", "no-store");
  res.end(combined);
});

/** POST /tts/synthesize – legacy endpoint for a single text block. */
router.post("/tts/synthesize", async (req, res): Promise<void> => {
  const { text, voice = NARRATOR_VOICE, rate = 0, style = "narration" } = req.body as {
    text?: string;
    voice?: string;
    rate?: number;
    style?: string;
  };

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "text é obrigatório" });
    return;
  }

  if (text.length > 5000) {
    res.status(400).json({ error: "text deve ter no máximo 5000 caracteres" });
    return;
  }

  const cleanText = sanitizeText(text);
  const prosody = STYLE_PROSODY[style] ?? STYLE_PROSODY.narration;
  const totalRate = Math.max(-80, Math.min(100, (Number(rate) || 0) + prosody.rateDelta));
  const rateStr = `${totalRate >= 0 ? "+" : ""}${totalRate}%`;
  const options: Record<string, string> = { rate: rateStr, pitch: prosody.pitch };
  if (prosody.volume) options.volume = prosody.volume;

  const cacheKey = createHash("sha256")
    .update(voice)
    .update(cleanText)
    .update(JSON.stringify(options))
    .digest("hex");
  const cachePath = getCachePath(cacheKey);

  // Serve from cache if present
  try {
    const cached = await fs.readFile(cachePath);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", cached.length);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(cached);
    return;
  } catch {}

  // Generate audio using Edge TTS
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, "audio_24khz_96kbitrate_mono_mp3");
  const { audioStream } = tts.toStream(cleanText, options);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("TTS stream timeout")), 30000);
    audioStream.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    audioStream.on("end", () => { clearTimeout(timeout); resolve(); });
    audioStream.on("error", (e) => { clearTimeout(timeout); reject(e); });
  });
  const audioBuffer = Buffer.concat(chunks);
  await fs.mkdir(resolve(cachePath, ".."), { recursive: true });
  await fs.writeFile(cachePath, audioBuffer);

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Length", audioBuffer.length);
  res.setHeader("Cache-Control", "no-store");
  res.end(audioBuffer);
});

export default router;
