import { Router, type IRouter } from "express";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { logger } from "../lib/logger";

const router: IRouter = Router();

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
    .replace(/['']/g, "'")
    .replace(/—/g, " - ")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .substring(0, 4800); // margem de segurança abaixo do limite de 5000
}

/** Chama msedge-tts com retry automático — trata drops de WebSocket */
async function synthesizeWithRetry(
  voice: string,
  text: string,
  options: Record<string, string>,
  maxAttempts = 3,
): Promise<Buffer> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      // backoff exponencial: 400ms, 800ms
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

      const { audioStream } = tts.toStream(text, options);
      const chunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("TTS stream timeout")), 30_000);
        audioStream.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        audioStream.on("end", () => { clearTimeout(timeout); resolve(); });
        audioStream.on("error", (err) => { clearTimeout(timeout); reject(err); });
      });

      const buf = Buffer.concat(chunks);

      // Buffer muito pequeno indica dado truncado — forçar retry
      if (buf.length < 1024) {
        throw new Error(`Audio buffer too small (${buf.length} bytes) — likely truncated`);
      }

      return buf;
    } catch (err) {
      lastErr = err;
      logger.warn({ err, attempt, voice }, "TTS attempt failed, retrying...");
    }
  }

  throw lastErr;
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
    const audioBuffer = await synthesizeWithRetry(voice, cleanText, options);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    res.setHeader("Cache-Control", "no-store");
    res.end(audioBuffer);
  } catch (err) {
    logger.error({ err }, "TTS synthesis failed after all retries");
    if (!res.headersSent) res.status(500).json({ error: "Falha na síntese de voz" });
  }
});

export default router;
