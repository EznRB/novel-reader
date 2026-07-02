export interface TTSProvider {
  /**
   * Synthesize audio for the given text.
   * @param text The input text (already sanitized).
   * @param voice Voice identifier (e.g., "pt-BR-AntonioNeural").
   * @param options TTS options such as rate, pitch, volume.
   * @returns Buffer containing MP3 audio data.
   */
  synthesize(text: string, voice: string, options: Record<string, string>): Promise<Buffer>;
}
