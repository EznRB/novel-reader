import { Router, type IRouter } from "express";
import { EdgeTTSProvider, NvidiaTTSProvider } from "../../../lib/tts/provider";
import { LocalDiskProvider } from "../../../lib/audio/provider/LocalDiskProvider";
import { createHash } from "crypto";
import { logger } from "../lib/logger";
import { ENABLE_EXPERIMENTAL_FEATURES } from "../../../lib/config/featureFlags";

const router: IRouter = Router();

// Storage provider for cached audio files (disk based)
const audioStorage = new LocalDiskProvider();

// TTS provider abstraction (currently Edge implementation)
let ttsProvider = ENABLE_EXPERIMENTAL_FEATURES ? new NvidiaTTSProvider() : new EdgeTTSProvider();

export const NARRATOR_VOICE = "pt-BR-AntonioNeural";

const STYLE_PROSODY: Record<string, { rateDelta: number; pitch: string; volume?: string }> = {
  narration:  { rateDelta: 0,   pitch: "+0Hz"  },
  dialogue:   { rateDelta: 8,   pitch: "+3Hz"  },
  cheerful:   { rateDelta: 12,  pitch: "+8Hz",  volume: "+10%" },
  sad:        { rateDelta: -18, pitch: "-5Hz",  volume: "-5%"  },
  excited:    { rateDelta: 20,  pitch: "+12Hz", volume: "+15%" },
  angry:      { rateDelta: 10,  pitch: "-6Hz",  volume: "+12%" },
  whisper:    { rateDelta: -28, pitch: "-4Hz",  volume: "-12%" },
};

/** Sanitiza o texto antes de enviar ao TTS — remove chars que confundem o serviço */
function sanitizeText(text: string): string {
  return text
    .trim()
    .replace(/[""]/g, '"')
    .replace(/[\'\']/g, "'")
    .replace(/—/g, " - ")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .substring(0, 4800); // margem de segurança abaixo do limite de 5000
}

// GET /tts/voices
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

// POST /tts/batch – gera áudio único para múltiplas frases (cache em disco)
router.post("/tts/batch", async (req, res): Promise<void> => {
  const {
    sentences,
    voice = NARRATOR_VOICE,
    rate = 0,
    style = "narration",
+  } = req.body as {
+    sentences?: string[];
+    voice?: string;
+    rate?: number;
+    style?: string;
+  };
+
+  if (!Array.isArray(sentences) || sentences.length === 0) {
+    res.status(400).json({ error: "sentences array is required" });
+    return;
+  }
+
+  // sanitiza cada sentença individualmente (mantém limite de 4800 chars por frase)
+  const cleanSentences = sentences.map(sanitizeText);
+  const prosody = STYLE_PROSODY[style] ?? STYLE_PROSODY.narration;
+  const totalRate = Math.max(-80, Math.min(100, (Number(rate) || 0) + prosody.rateDelta));
+  const rateStr = `${totalRate >= 0 ? "+" : ""}${totalRate}%`;
+  const options: Record<string, string> = { rate: rateStr, pitch: prosody.pitch };
+  if (prosody.volume) options.volume = prosody.volume;
+
+  // chave única baseada no conteúdo das frases + parâmetros
+  const cacheKey = createHash('sha256')
+    .update(voice)
+    .update(JSON.stringify(cleanSentences))
+    .update(JSON.stringify(options))
+    .digest('hex');
+  const cachePath = `${cacheKey}.mp3`;
+
+  // tenta servir do cache
+  if (await audioStorage.exists(cachePath)) {
+    const cached = await audioStorage.read(cachePath);
+    res.setHeader('Content-Type', 'audio/mpeg');
+    res.setHeader('Content-Length', cached.length);
+    res.setHeader('Cache-Control', 'public, max-age=86400');
+    res.end(cached);
+    return;
+  }
+
+  // gera áudio de cada sentença sequencialmente (para garantir ordem e rate‑limit)
+  const buffers: Buffer[] = [];
+  for (const sentence of cleanSentences) {
+    const buf = await synthesizeWithRetry(voice, sentence, options);
+    buffers.push(buf);
+  }
+  const combined = Buffer.concat(buffers);
+  // persiste no cache
+  await audioStorage.save(cachePath, combined);
+
+  res.setHeader('Content-Type', 'audio/mpeg');
+  res.setHeader('Content-Length', combined.length);
+  res.setHeader('Cache-Control', 'no-store');
+  res.end(combined);
+});

// POST /tts/synthesize
router.post("/tts/synthesize", async (req, res): Promise<void> => {
  const {
    text,
    voice = NARRATOR_VOICE,
    rate = 0,
    style = "narration",
  } = req.body as {
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
  const prosody   = STYLE_PROSODY[style] ?? STYLE_PROSODY.narration;
  const totalRate = Math.max(-80, Math.min(100, (Number(rate) || 0) + prosody.rateDelta));
  const rateStr   = `${totalRate >= 0 ? "+" : ""}${totalRate}%`;

  const options: Record<string, string> = { rate: rateStr, pitch: prosody.pitch };
  if (prosody.volume) options.volume = prosody.volume;

  try {
    // Compute deterministic cache key based on input parameters
    const cacheKey = createHash('sha256')
      .update(voice)
      .update(cleanText)
      .update(JSON.stringify(options))
      .digest('hex');
    const cachePath = `${cacheKey}.mp3`;

    // Try to serve from cache first
    if (await audioStorage.exists(cachePath)) {
      const cachedBuffer = await audioStorage.read(cachePath);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', cachedBuffer.length);
      // Allow browsers to cache (client-side) – we control server-side via our own cache
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(cachedBuffer);
      return;
    }

    // Not cached – generate via TTS and then store
    const audioBuffer = await synthesizeWithRetry(voice, cleanText, options);
    // Persist to disk cache (non‑blocking, but we await to guarantee persistence)
    await audioStorage.save(cachePath, audioBuffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.end(audioBuffer);
  } catch (err) {
    logger.error({ err }, 'TTS synthesis failed after all retries');
    if (!res.headersSent) res.status(500).json({ error: 'Falha na síntese de voz' });
  }
});

export default router;
