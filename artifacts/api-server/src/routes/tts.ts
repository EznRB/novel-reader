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

// NVIDIA available voices (Magpie TTS Multilingual)
const NVIDIA_VOICES = [
  { id: "male_1",   label: "Male — Confident",     gender: "male"   },
  { id: "male_2",   label: "Male — Deep",           gender: "male"   },
  { id: "male_3",   label: "Male — Young",          gender: "male"   },
  { id: "female_1", label: "Female — Clear",        gender: "female" },
  { id: "female_2", label: "Female — Soft",         gender: "female" },
  { id: "female_3", label: "Female — Expressive",   gender: "female" },
];

// GET /tts/voices  (msedge voices)
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

// GET /tts/nvidia-voices
router.get("/tts/nvidia-voices", (_req, res): void => {
  res.json(NVIDIA_VOICES);
});

// POST /tts/synthesize  (msedge-tts — existing endpoint)
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

// POST /tts/nvidia-synthesize  (NVIDIA NIM TTS — high quality)
router.post("/tts/nvidia-synthesize", async (req, res): Promise<void> => {
  const {
    text,
    voice = "male_1",
    speed = 1.0,
    language = "en-US",
  } = req.body as {
    text?: string;
    voice?: string;
    speed?: number;
    language?: string;
  };

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  if (text.length > 5000) {
    res.status(400).json({ error: "text must be 5000 characters or less" });
    return;
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    logger.warn("NVIDIA_API_KEY not set — NVIDIA TTS unavailable");
    res.status(503).json({ error: "NVIDIA TTS not configured" });
    return;
  }

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        model: "magpie-tts-multilingual",
        input: text,
        voice,
        response_format: "mp3",
        speed: Math.max(0.25, Math.min(4.0, Number(speed) || 1.0)),
        language_code: language,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, body: errText }, "NVIDIA TTS API error");
      res.status(502).json({ error: `NVIDIA TTS failed: ${response.status}` });
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.end(buffer);
  } catch (err) {
    logger.error({ err }, "NVIDIA TTS synthesis failed");
    if (!res.headersSent) res.status(500).json({ error: "NVIDIA TTS synthesis failed" });
  }
});

export default router;
