// Worker do codificador MP3 (`mp3.ts`). Arquivo .mjs comum, fora do empacotamento do Next: é carregado pelo
// caminho em disco. Recebe { buffer: ArrayBuffer (transferido), byteOffset (par), sampleCount, sampleRate,
// trailingSamples, kbps }, devolve { ok: true, mp3: Uint8Array } ou { ok: false, message }.
//
// Memória: as amostras são uma VISTA Int16Array sobre o ArrayBuffer recebido (sem cópia). O silêncio do fim é
// codificado em blocos à parte. A divisão em blocos de 1152 amostras é a mesma de quando amostras e silêncio
// ficavam num buffer só (o bloco da junção é montado à parte), então os bytes do MP3 não mudam.
import { parentPort, workerData } from "node:worker_threads";
import { Mp3Encoder } from "@breezystack/lamejs";

const BLOCK = 1152;
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** As amostras: vista sem cópia; numa máquina big-endian, convertidas uma a uma. */
function samplesOf(buffer, byteOffset, count) {
  if (LITTLE_ENDIAN) return new Int16Array(buffer, byteOffset, count);
  const view = new DataView(buffer, byteOffset, count * 2);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i++) samples[i] = view.getInt16(i * 2, true);
  return samples;
}

try {
  const { buffer, byteOffset, sampleCount, sampleRate, trailingSamples, kbps } = workerData;
  const samples = samplesOf(buffer, byteOffset, sampleCount);
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const parts = [];
  let total = 0;
  const push = (chunk) => {
    if (chunk.length > 0) {
      parts.push(Uint8Array.from(chunk));
      total += chunk.length;
    }
  };

  const length = samples.length + trailingSamples;
  const silence = new Int16Array(BLOCK);
  for (let i = 0; i < length; i += BLOCK) {
    const end = Math.min(i + BLOCK, length);
    if (end <= samples.length) {
      push(encoder.encodeBuffer(samples.subarray(i, end)));
    } else if (i >= samples.length) {
      push(encoder.encodeBuffer(end - i === BLOCK ? silence : silence.subarray(0, end - i)));
    } else {
      // Bloco da junção: o fim das amostras seguido de zeros.
      const block = new Int16Array(end - i);
      block.set(samples.subarray(i));
      push(encoder.encodeBuffer(block));
    }
  }
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
