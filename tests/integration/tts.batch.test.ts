import request from 'supertest';
import app from '../../artifacts/api-server/src/app';
import { promises as fs } from 'fs';
import path from 'path';

// Mock EdgeTTSProvider to avoid external calls
jest.mock('../../lib/tts/provider', () => ({
  EdgeTTSProvider: jest.fn().mockImplementation(() => ({
    synthesize: jest.fn().mockResolvedValue(Buffer.from('FAKE_MP3_DATA')),
  })),
  NvidiaTTSProvider: jest.fn().mockImplementation(() => ({
    synthesize: jest.fn().mockResolvedValue(Buffer.from('FAKE_NVIDIA_MP3')),
  })),
}));

describe('POST /api/tts/batch', () => {
  const cacheDir = path.resolve(process.cwd(), 'cache', 'tts');

  afterAll(async () => {
    // Cleanup generated cache files (if any)
    try {
      await fs.rmdir(cacheDir, { recursive: true });
    } catch {}
  });

  it('should return MP3 audio for a single sentence block', async () => {
    const response = await request(app)
      .post('/api/tts/batch')
      .send({
        sentences: ['Hello world, this is a test sentence for TTS block.'],
        voice: 'pt-BR-AntonioNeural',
        rate: 0,
        style: 'narration',
      })
      .expect('Content-Type', /audio\/mpeg/)
      .expect(200);

    expect(response.body).toBeInstanceOf(Buffer);
    expect(response.body.length).toBeGreaterThan(0);
  });
});
