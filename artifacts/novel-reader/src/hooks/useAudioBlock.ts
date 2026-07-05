// @ts-nocheck
import { useCallback, useMemo } from "react";

import type { AudioCache } from "@workspace/db";
const logger = {
  error: (...args:any[]) => console.error(...args),
  warn: (...args:any[]) => console.warn(...args),
  info: (...args:any[]) => console.info(...args),
};

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

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
      const hash = simpleHash(blockText);
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
