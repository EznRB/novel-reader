import { EdgeTTSProvider } from "@workspace/tts/provider";

describe("EdgeTTSProvider", () => {
  it("rejects empty text", async () => {
    const provider = new EdgeTTSProvider();
    await expect(
      provider.synthesize("", "pt-BR-AntonioNeural", {})
    ).rejects.toThrow();
  });
});
