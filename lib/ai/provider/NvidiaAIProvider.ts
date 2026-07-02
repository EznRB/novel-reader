import { AIProvider } from "./AIProvider";
import { logger } from "../../../artifacts/api-server/src/lib/logger";

/**
 * Stub for NVIDIA NIM AI integration.
 */
export class NvidiaAIProvider implements AIProvider {
  async chat<T>(_payload: unknown): Promise<T> {
    logger.warn("NvidiaAIProvider chat not implemented");
    throw new Error("NvidiaAIProvider not implemented");
  }
}
