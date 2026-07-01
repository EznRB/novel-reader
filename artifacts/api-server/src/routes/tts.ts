import { Router, type IRouter } from "express";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Voz fixa do narrador — alta qualidade, excelente para leituras longas
export const NARRATOR_VOICE = "pt-BR-AntonioNeural";

// Style → prosody adjustments para pt-BR
const STYLE_PROSODY: Record<string, { rateDelta: number; pitch: string; volume?: string }> = {
  narration:  { rateDelta: 0,   pitch: "+0Hz"  },
  dialogue:   { rateDelta: 8,   pitch: "+3Hz"  },
  cheerful:   { rateDelta: 12,  pitch: "+8Hz",  volume: "+10%" },
  sad:        { rateDelta: -18, pitch: "-5Hz",  volume: "-5%"  },
  excited:    { rateDelta: 20,  pitch: "+12Hz", volume: "+15%" },
  angry:      { rateDelta: 10,  pitch: "-6Hz",  volume: "+12%" },
  whisper:    { rateDelta: -28, pitch: "-4Hz",  volume: "-12%" },
};

// GET /tts/voices  (para compatibilidade; frontend não exibe mais seletor)
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

// POST /tts/synthesize  (msedge-tts — coleta buffer completo antes de enviar)
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

  const prosody = STYLE_PROSODY[style] ?? STYLE_PROSODY.narration;
  const totalRate = Math.max(-80, Math.min(100, (Number(rate) || 0) + prosody.rateDelta));
  const rateStr = `${totalRate >= 0 ? "+" : ""}${totalRate}%`;

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const options: Record<string, string> = { rate: rateStr, pitch: prosody.pitch };
    if (prosody.volume) options.volume = prosody.volume;

    const { audioStream } = tts.toStream(text.trim(), options);

    // Coleta TODOS os chunks antes de enviar — garante MP3 completo com duração correta
    // Isso resolve o bug de áudio parando prematuramente no browser
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      audioStream.on("data", (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      audioStream.on("end", resolve);
      audioStream.on("error", reject);
    });

    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      res.status(500).json({ error: "TTS retornou áudio vazio" });
      return;
    }

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
