export interface AIProvider {
  /**
   * Perform a chat/completion request.
   * @param payload Request payload matching OpenAI SDK shape.
   * @returns The parsed response.
   */
  chat<T>(payload: unknown): Promise<T>;
}
