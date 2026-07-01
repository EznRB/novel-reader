---
name: TTS audio stopping fix
description: msedge-tts streaming mode causes browser to mis-calculate audio duration, firing ended event too early. Fix: buffer + canplaythrough.
---

# TTS Audio Premature Stop Fix

## The rule
Never pipe msedge-tts audioStream directly to the HTTP response (`audioStream.pipe(res)`). Always collect all chunks into a Buffer first, then send with `Content-Length`.

## Why
When streaming chunked Transfer-Encoding, the browser receives audio in fragments and cannot determine the total MP3 duration. This causes `ended` to fire before all audio has played (often after only a few seconds), making narration stop unexpectedly.

## How to apply
Backend (`tts.ts`):
```typescript
const chunks: Buffer[] = [];
await new Promise<void>((resolve, reject) => {
  audioStream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  audioStream.on("end", resolve);
  audioStream.on("error", reject);
});
const audioBuffer = Buffer.concat(chunks);
res.setHeader("Content-Type", "audio/mpeg");
res.setHeader("Content-Length", audioBuffer.length);
res.end(audioBuffer);
```

Frontend (`audio-player.tsx`) — wait for `canplaythrough` before `play()`:
```typescript
audio.src = url;
await new Promise<void>((resolve, reject) => {
  audio.addEventListener("canplaythrough", resolve, { once: true });
  audio.addEventListener("error", reject, { once: true });
  audio.load();
});
await audio.play();
```

This combination guarantees the browser gets a complete MP3 with correct headers and buffers it fully before playback begins.
