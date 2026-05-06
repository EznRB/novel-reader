import { Router, type IRouter } from "express";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Style → prosody adjustments (rate delta %, pitch Hz, optional volume %)
const STYLE_PROSODY: Record<string, { rateDelta: number; pitch: string; volume?: string }> = {
  narration:  { rateDelta: 0,   pitch: "+0Hz" },
  dialogue:   { rateDelta: 5,   pitch: "+2Hz" },
  cheerful:   { rateDelta: 10,  pitch: "+6Hz",  volume: "+10%" },
  sad:        { rateDelta: -20, pitch: "-6Hz",  volume: "-5%"  },
  excited:    { rateDelta: 18,  pitch: "+10Hz", volume: "+15%" },
  angry:      { rateDelta: 8,   pitch: "-8Hz",  volume: "+10%" },
  whisper:    { rateDelta: -25, pitch: "-3Hz",  volume: "-10%" },
};

// GET /tts/voices
router.get("/tts/voices", async (_req, res): Promise<void> => {
  try {
    const tts = new MsEdgeTTS();
    const voices = await tts.getVoices();
    res.json(voices);
  } catch (err) {
    logger.error({ err }, "Failed to fetch TTS voices");
    res.status(500).json({ error: "Failed to fetch voices" });
  }
});

// POST /tts/synthesize
router.post("/tts/synthesize", async (req, res): Promise<void> => {
  const {
    text,
    voice = "en-US-AriaNeural",
    rate = 0,
    style = "narration",
  } = req.body as {
    text?: string;
    voice?: string;
    rate?: number;
    style?: string;
  };

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  if (text.length > 5000) {
    res.status(400).json({ error: "text must be 5000 characters or less" });
    return;
  }

  const prosody = STYLE_PROSODY[style] ?? STYLE_PROSODY.narration;
  const totalRate = Math.max(-80, Math.min(100, (Number(rate) || 0) + prosody.rateDelta));
  const rateStr = `${totalRate >= 0 ? "+" : ""}${totalRate}%`;

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Transfer-Encoding", "chunked");

    const options: Record<string, string> = { rate: rateStr, pitch: prosody.pitch };
    if (prosody.volume) options.volume = prosody.volume;

    const { audioStream } = tts.toStream(text, options);

    audioStream.on("error", (err) => {
      logger.error({ err }, "TTS audio stream error");
      if (!res.headersSent) res.status(500).end();
    });

    audioStream.pipe(res);
  } catch (err) {
    logger.error({ err }, "TTS synthesis failed");
    if (!res.headersSent) res.status(500).json({ error: "TTS synthesis failed" });
  }
});

export default router;
