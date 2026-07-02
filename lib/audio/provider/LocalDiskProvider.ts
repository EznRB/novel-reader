import { promises as fs } from "fs";
import { join, resolve } from "path";
import { AudioStorageProvider } from "./AudioStorageProvider";

/**
 * LocalDiskProvider persiste arquivos de áudio em disco dentro da pasta ./cache/tts.
 * O caminho passado para os métodos é sempre relativo ao diretório base.
 * Ex.: "book_12/chapter_001/block_001.mp3"
 */
export class LocalDiskProvider implements AudioStorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    // Se não for especificado, usa o diretório "cache/tts" na raiz do projeto.
    const defaultDir = resolve(process.cwd(), "cache", "tts");
    this.baseDir = baseDir ? resolve(baseDir) : defaultDir;
  }

  private absolutePath(relativePath: string): string {
    // Remove possíveis ../ para evitar escape do diretório base.
    const safePath = relativePath.replace(/\.{2,}/g, "");
    return join(this.baseDir, safePath);
  }

  async save(relativePath: string, data: Buffer): Promise<void> {
    const fullPath = this.absolutePath(relativePath);
    await fs.mkdir(join(fullPath, ".."), { recursive: true }); // ensure directory exists
    await fs.writeFile(fullPath, data);
  }

  async read(relativePath: string): Promise<Buffer> {
    const fullPath = this.absolutePath(relativePath);
    return await fs.readFile(fullPath);
  }

  async exists(relativePath: string): Promise<boolean> {
    const fullPath = this.absolutePath(relativePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(relativePath: string): Promise<void> {
    const fullPath = this.absolutePath(relativePath);
    try {
      await fs.unlink(fullPath);
    } catch {
      // ignore if file does not exist
    }
  }
}
