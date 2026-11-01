// Codifica o WAV de uma célula em MP3 (mono, @breezystack/lamejs) numa worker_thread, para uma célula longa não
// travar o servidor. Cada célula vira um MP3 independente, com silêncio no fim para separá-la da próxima.
// Só para o servidor.
//
// Memória: um WAV longo pesa ~44 KB por segundo de fala (22 050 Hz × 16 bits). O caminho até o worker não copia
// as amostras: aqui só o cabeçalho é lido (sem laço por amostra) e o worker monta o Int16Array como VISTA sobre o
// ArrayBuffer que recebe. Com `transfer: true` esse ArrayBuffer é o do próprio Buffer do WAV, transferido (o
// Buffer de quem chamou fica vazio); sem ele, ou quando transferir não é seguro, vão para o worker só os bytes
// das amostras, copiados uma vez. O silêncio do fim é codificado à parte (sem montar um buffer com tudo).
import path from "node:path";
import { Worker } from "node:worker_threads";
import { LITTLE_ENDIAN, parseWavHeader, samplesFor } from "@/features/voz/wav";

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

type WorkerData = {
  /** Bytes que contêm as amostras; transferido ao worker (some deste lado). */
  buffer: ArrayBuffer;
  /** Início das amostras dentro de `buffer` (sempre par). */
  byteOffset: number;
  sampleCount: number;
  sampleRate: number;
  trailingSamples: number;
  kbps: number;
};

function runWorker(data: WorkerData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(mp3WorkerPath(), { workerData: data, transferList: [data.buffer] });
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

/**
 * Pode entregar o ArrayBuffer do próprio Buffer ao worker? Só se o Buffer for dono dele inteiro: um Buffer
 * pequeno costuma ser uma fatia do pool compartilhado do Node (`Buffer.from`, `Buffer.concat`, `allocUnsafe` <
 * 4 KB), e transferir o pool deixaria sem bytes outros Buffers que não têm nada a ver com o WAV. `fs.readFile`
 * (Piper) e `Buffer.alloc` (motor falso) devolvem Buffers donos do ArrayBuffer inteiro. Também precisa ser um
 * ArrayBuffer comum (não SharedArrayBuffer) e as amostras começarem num endereço par (o worker monta um
 * Int16Array sobre ele) numa máquina little-endian.
 */
function canTransfer(wav: Buffer, start: number): wav is Buffer & { buffer: ArrayBuffer } {
  return (
    LITTLE_ENDIAN &&
    wav.buffer instanceof ArrayBuffer &&
    wav.byteOffset === 0 &&
    wav.byteLength === wav.buffer.byteLength &&
    start % 2 === 0
  );
}

/**
 * WAV (PCM mono 16 bits, qualquer taxa) → MP3, com `trailingSilenceMs` (padrão 600 ms) de silêncio no fim, na
 * taxa do próprio WAV. Com `transfer: true` o ArrayBuffer do WAV vai para o worker sem cópia quando é seguro
 * (`canTransfer`) e o Buffer passado fica vazio: use só quando ninguém mais vai ler esse WAV.
 */
export async function encodeMp3(wav: Buffer, opts: { trailingSilenceMs?: number; transfer?: boolean } = {}): Promise<Buffer> {
  const { sampleRate, dataOffset, sampleCount } = parseWavHeader(wav);
  const trailingSamples = samplesFor(opts.trailingSilenceMs ?? TRAILING_SILENCE_MS, sampleRate);
  const start = wav.byteOffset + dataOffset;
  if (opts.transfer && canTransfer(wav, start)) {
    return runWorker({ buffer: wav.buffer, byteOffset: start, sampleCount, sampleRate, trailingSamples, kbps: KBPS });
  }
  // Uma cópia só dos bytes das amostras, num ArrayBuffer novo (começa em 0, alinhado). Num big-endian o worker
  // troca a ordem dos bytes ao ler.
  const bytes = new Uint8Array(wav.buffer, start, sampleCount * 2).slice();
  return runWorker({ buffer: bytes.buffer, byteOffset: 0, sampleCount, sampleRate, trailingSamples, kbps: KBPS });
}
