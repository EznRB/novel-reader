declare module "msedge-tts" {
  export interface OUTPUT_FORMAT {
    AUDIO_24KHZ_96KBITRATE_MONO_MP3: string;
  }
  export class MsEdgeTTS {
    constructor();
    setMetadata(voice: string, format: string): void;
    toStream(text: string, options: Record<string, string>): { audioStream: NodeJS.ReadableStream };
    getVoices(): Promise<any[]>;
  }
}
