// Codifica o WAV de uma célula em MP3 (mono, @breezystack/lamejs) numa worker_thread, para uma célula longa não
// travar o servidor. Cada célula vira um MP3 independente, com silêncio no fim para separá-la da próxima.
// Só para o servidor.
import path from "node:path";
import { Worker } from "node:worker_threads";
import { parseWav, samplesFor } from "@/features/voz/wav";

export const TRAILING_SILENCE_MS = 600;
const KBPS = 64;

/**
 * Caminho do worker em disco. Ele é um .mjs comum, que o Next não empacota: o servidor (`next start`, pm2)
 * roda com a pasta do projeto como diretório atual, então o caminho parte de `process.cwd()`.
 */
export function mp3WorkerPath(): string {
  return path.join(process.cwd(), "src", "features", "voz", "mp3-worker.mjs");
}

type WorkerReply = { ok: true; mp3: Uint8Array } | { ok: false; message: string };

function runWorker(data: { samples: Int16Array; sampleRate: number; trailingSamples: number; kbps: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(mp3WorkerPath(), { workerData: data, transferList: [data.samples.buffer as ArrayBuffer] });
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    worker.once("message", (reply: WorkerReply) => {
      finish(() => {
        if (reply.ok) resolve(Buffer.from(reply.mp3.buffer, reply.mp3.byteOffset, reply.mp3.byteLength));
        else reject(new Error(`MP3: ${reply.message}`));
      });
    });
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => finish(() => reject(new Error(`MP3: o worker saiu com código ${code}`))));
  });
}

/** WAV (PCM mono 16 bits, qualquer taxa) → MP3, com `trailingSilenceMs` (padrão 600 ms) de silêncio no fim. */
export async function encodeMp3(wav: Buffer, opts: { trailingSilenceMs?: number } = {}): Promise<Buffer> {
  const { sampleRate, samples } = parseWav(wav);
  const trailingSamples = samplesFor(opts.trailingSilenceMs ?? TRAILING_SILENCE_MS, sampleRate);
  return runWorker({ samples, sampleRate, trailingSamples, kbps: KBPS });
}
