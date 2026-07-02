import { LocalDiskProvider } from "../../lib/audio/provider/LocalDiskProvider";
import * as fs from "fs";
import os from "os";
import path from "path";

describe("LocalDiskProvider", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-test-"));
  const provider = new LocalDiskProvider(tmpDir);
  const testPath = "test/file.mp3";
  const testData = Buffer.from("hello world");

  afterAll(async () => {
    try {
      await provider.delete(testPath);
      await fs.promises.rmdir(tmpDir, { recursive: true });
    } catch {}
  });

  it("saves and reads a file", async () => {
    await provider.save(testPath, testData);
    const exists = await provider.exists(testPath);
    expect(exists).toBe(true);
    const data = await provider.read(testPath);
    expect(data.equals(testData)).toBe(true);
  });

  it("deletes a file", async () => {
    await provider.delete(testPath);
    const exists = await provider.exists(testPath);
    expect(exists).toBe(false);
  });
});
