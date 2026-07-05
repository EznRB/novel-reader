import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { TTSProvider } from "./TTSProvider";
import { logger } from "../../../artifacts/api-server/src/lib/logger";

/**
 * Edge TTS implementation using the msedge-tts package.
 * Includes automatic retry and minimal stream timeout handling.
 */
export class EdgeTTSProvider implements TTSProvider {
  /** Number of attempts before giving up */
  private readonly maxAttempts: number;

  constructor(maxAttempts = 3) {
    this.maxAttempts = maxAttempts;
  }

  async synthesize(text: string, voice: string, options: Record<string, string>): Promise<Buffer> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      if (attempt > 0) {
        // Exponential back‑off: 400ms, 800ms, …
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
      try {
        const tts = new MsEdgeTTS();
        // @ts-ignore
await tts.setMetadata(voice, (OUTPUT_FORMAT as any).AUDIO_24KHZ_96KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream(text, options);
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("TTS stream timeout")), 30_000);
          audioStream.on("data", (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          audioStream.on("end", () => {
            clearTimeout(timeout);
            resolve();
          });
          audioStream.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
        const buf = Buffer.concat(chunks);
        if (buf.length < 1024) {
          throw new Error(`Audio buffer too small (${buf.length} bytes)`);
        }
        return buf;
      } catch (err) {
        lastErr = err;
        logger.warn({ err, attempt, voice }, "Edge TTS attempt failed");
      }
    }
    throw lastErr;
  }
}
