import { Router, type IRouter } from "express";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /api/tts/voices
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

// POST /api/tts/synthesize
router.post("/tts/synthesize", async (req, res): Promise<void> => {
  const { text, voice = "en-US-AriaNeural", rate = 0 } = req.body as {
    text?: string;
    voice?: string;
    rate?: number;
  };

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  if (text.length > 5000) {
    res.status(400).json({ error: "text must be 5000 characters or less" });
    return;
  }

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Transfer-Encoding", "chunked");

    const { audioStream } = tts.toStream(text, {
      rate: `${rate > 0 ? "+" : ""}${rate}%`,
    });

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
