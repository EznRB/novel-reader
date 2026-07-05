// @ts-nocheck
import { useCallback, useMemo } from "react";
import { createHash } from "crypto";
import type { AudioCache } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * Divide a large text into smaller blocks (roughly 30‑90 seconds of speech).
 * Uses an average speech speed of 2.5 words / second (≈150 wpm).
 * Each block is limited to `maxWords` (default 300 ≈ 2 min) to keep duration reasonable.
 *
 * Returns an array of block objects containing the plain text and a deterministic hash.
 */
export function useAudioBlocks(text: string, maxWords = 300) {
  const blocks = useMemo(() => {
    const words = text.trim().split(/\s+/);
    const result: { text: string; hash: string }[] = [];
    for (let i = 0; i < words.length; i += maxWords) {
      const slice = words.slice(i, i + maxWords);
      const blockText = slice.join(" ");
      const hash = createHash("sha256").update(blockText).digest("hex");
      result.push({ text: blockText, hash });
    }
    return result;
  }, [text, maxWords]);

  /**
   * Fetch a block's audio from the TTS batch endpoint.
   * Returns a Promise that resolves to a Blob URL.
   */
  const fetchBlock = useCallback(
    async (blockIndex: number, voice = "pt-BR-AntonioNeural", rate = 0, style = "narration") => {
      const blk = blocks[blockIndex];
      if (!blk) throw new Error(`Block index ${blockIndex} out of range`);
      const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
      const res = await fetch(`${base}/api/tts/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentences: [blk.text], voice, rate, style }),
      });
      if (!res.ok) {
        const err = await res.text();
        logger.error({ err, status: res.status }, "Failed to fetch audio block");
        throw new Error(`TTS batch error ${res.status}`);
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    [blocks],
  );

  return { blocks, fetchBlock };
}
