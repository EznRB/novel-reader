import { TTSProvider } from "./TTSProvider";
import { logger } from "../../../artifacts/api-server/src/lib/logger";
import { openai } from "@workspace/integrations-openai-ai-server";
import { withRateLimit } from "../../../lib/integrations-openai-ai-server/src/rateLimiter";

/**
 * NVIDIA NIM TTS provider implementation.
 * Uses the OpenAI‑compatible client configured for NVIDIA NIM.
 * Model name is assumed to be "tts-1" (placeholder – replace with actual model when known).
 */
export class NvidiaTTSProvider implements TTSProvider {
  private readonly model: string;

  constructor(model = "tts-1") {
    this.model = model;
  }

  async synthesize(text: string, voice: string, _options: Record<string, string>): Promise<Buffer> {
    // The current OpenAI SDK returns a ReadableStream for audio.
    // We wrap the call with the global rate‑limiter.
    const response = await withRateLimit(() =>
      openai.audio.speech.create({
        model: this.model,
        voice,
        input: text,
      })
    );
    // `response` is a ReadableStream<Uint8Array>. Collect it into a Buffer.
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.body as any) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    if (buffer.length < 1024) {
      logger.warn(`NvidiaTTSProvider received small audio (${buffer.length} bytes)`);
      throw new Error(`Audio buffer too small (${buffer.length} bytes)`);
    }
    return buffer;
  }
}
