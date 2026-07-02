import Bottleneck from "bottleneck";

/**
 * Bottleneck instance to rate‑limit OpenAI / NVIDIA NIM API calls.
 * Adjust `minTime` and `maxConcurrent` based on provider limits.
 */
export const apiLimiter = new Bottleneck({
  // minimum time between calls – 200 ms => max 5 calls/sec
  minTime: 200,
  // allow a few concurrent requests (e.g., 3) for parallelism
  maxConcurrent: 3,
});

/**
 * Wrap an async operation with the global `apiLimiter`.
 * Usage: `await withRateLimit(() => openai.chat.completions.create(...))`
 */
export function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  return apiLimiter.schedule(fn);
}
