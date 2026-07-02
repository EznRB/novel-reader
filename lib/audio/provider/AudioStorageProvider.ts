export interface AudioStorageProvider {
  /**
   * Persiste o buffer de áudio em um caminho lógico (gerado a partir de identificadores).
   * O caminho deve ser relativo ao diretório base do storage.
   */
  save(relativePath: string, data: Buffer): Promise<void>;

  /**
   * Lê um arquivo de áudio previamente armazenado.
   * Lança erro caso o arquivo não exista.
   */
  read(relativePath: string): Promise<Buffer>;

  /**
   * Verifica se um arquivo já está armazenado.
   */
  exists(relativePath: string): Promise<boolean>;

  /**
   * Remove um arquivo armazenado.
   */
  delete(relativePath: string): Promise<void>;
}
