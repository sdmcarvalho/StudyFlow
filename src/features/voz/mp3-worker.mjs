// Worker do codificador MP3 (`mp3.ts`). Arquivo .mjs comum, fora do empacotamento do Next: é carregado pelo
// caminho em disco. Recebe { samples: Int16Array, sampleRate, trailingSamples, kbps }, devolve
// { ok: true, mp3: Uint8Array } ou { ok: false, message }.
import { parentPort, workerData } from "node:worker_threads";
import { Mp3Encoder } from "@breezystack/lamejs";

const BLOCK = 1152;

try {
  const { samples, sampleRate, trailingSamples, kbps } = workerData;
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const parts = [];
  let total = 0;
  const push = (chunk) => {
    if (chunk.length > 0) {
      parts.push(Uint8Array.from(chunk));
      total += chunk.length;
    }
  };
  const all = new Int16Array(samples.length + trailingSamples);
  all.set(samples, 0);
  for (let i = 0; i < all.length; i += BLOCK) push(encoder.encodeBuffer(all.subarray(i, i + BLOCK)));
  push(encoder.flush());
  const mp3 = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    mp3.set(part, offset);
    offset += part.length;
  }
  parentPort.postMessage({ ok: true, mp3 }, [mp3.buffer]);
} catch (error) {
  parentPort.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
}
