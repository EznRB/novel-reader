// TTS routes – batch and single synthesis
import { Router, type IRouter } from "express";
import { EdgeTTSProvider, NvidiaTTSProvider } from "../../../lib/tts/provider";
import { LocalDiskProvider } from "../../../lib/audio/provider/LocalDiskProvider";
import { createHash } from "crypto";
import { logger } from "../lib/logger";
import { ENABLE_EXPERIMENTAL_FEATURES } from "../../../lib/config/featureFlags";
import { MsEdgeTTS } from "msedge-tts";

const router: IRouter = Router();

// Disk cache for audio files
const audioStorage = new LocalDiskProvider();

// Choose TTS implementation based on feature flag
let ttsProvider = ENABLE_EXPERIMENTAL_FEATURES ? new NvidiaTTSProvider() : new EdgeTTSProvider();

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

/**
 * POST /tts/batch – synthesize an array of sentences, concatenate, cache on disk.
 */
router.post("/tts/batch", async (req, res): Promise<void> => {
  const {
    sentences,
    voice = NARRATOR_VOICE,
    rate = 0,
    style = "narration",
  } = req.body as {
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
  const cachePath = `${cacheKey}.mp3`;

  // Serve from cache if present
  if (await audioStorage.exists(cachePath)) {
    const cached = await audioStorage.read(cachePath);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", cached.length);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(cached);
    return;
  }

  // Generate audio sequentially to preserve order and respect rate limits
  const buffers: Buffer[] = [];
  for (const sentence of cleanSentences) {
    const buf = await ttsProvider.synthesize(sentence, voice, options);
    buffers.push(buf);
  }
  const combined = Buffer.concat(buffers);
  await audioStorage.save(cachePath, combined);

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Length", combined.length);
  res.setHeader("Cache-Control", "no-store");
  res.end(combined);
});

/**
 * POST /tts/synthesize – legacy endpoint for a single text block.
 */
router.post("/tts/synthesize", async (req, res): Promise<void> => {
  const {
    text,
    voice = NARRATOR_VOICE,
    rate = 0,
    style = "narration",
  } = req.body as { text?: string; voice?: string; rate?: number; style?: string };

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

  try {
    const cacheKey = createHash("sha256")
      .update(voice)
      .update(cleanText)
      .update(JSON.stringify(options))
      .digest("hex");
    const cachePath = `${cacheKey}.mp3`;

    if (await audioStorage.exists(cachePath)) {
      const cached = await audioStorage.read(cachePath);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", cached.length);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(cached);
      return;
    }

    const audioBuffer = await ttsProvider.synthesize(cleanText, voice, options);
    await audioStorage.save(cachePath, audioBuffer);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    res.setHeader("Cache-Control", "no-store");
    res.end(audioBuffer);
  } catch (err) {
    logger.error({ err }, "TTS synthesis failed");
    if (!res.headersSent) res.status(500).json({ error: "Falha na síntese de voz" });
  }
});

export default router;
