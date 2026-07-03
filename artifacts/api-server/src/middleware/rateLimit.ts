import type { Request, Response, NextFunction } from "express";
import { apiLimiter } from "@workspace/integrations-openai-ai-server/src/rateLimiter";

/**
 * Global rate‑limit middleware using Bottleneck.
 * Allows a maximum of 5 requests per second (minTime = 200 ms) and up to 3 concurrent.
 * Responds with 429 when the limiter rejects the request.
 */
export const rateLimitMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Schedule a no‑op through the limiter; it will resolve when the token is available.
  apiLimiter
    .schedule(() => Promise.resolve())
    .then(() => next())
    .catch(() => {
      res.status(429).json({ error: "Too many requests – rate limited" });
    });
};
