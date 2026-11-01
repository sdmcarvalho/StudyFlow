// Leitura e geração de WAV PCM mono 16 bits (o formato do Piper). A taxa vem sempre do cabeçalho: depende da
// voz (22 050 Hz nas "medium", 16 000 Hz na edresson-low).

export const DEFAULT_SAMPLE_RATE = 22050;

const FORMAT_PCM = 1;
const FORMAT_EXTENSIBLE = 0xfffe;

function invalid(reason: string): never {
  throw new Error(`WAV inválido: ${reason}`);
}

/** O Int16Array lê na ordem de bytes da máquina; o WAV é little-endian (x86 e ARM também são). */
export const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

export type WavHeader = {
  sampleRate: number;
  /** Onde começam as amostras, contado do início do Buffer (não do ArrayBuffer). */
  dataOffset: number;
  sampleCount: number;
};

/**
 * Lê o cabeçalho de um WAV PCM mono de 16 bits, sem tocar nas amostras. Pula pedaços extras (`LIST` etc., com o
 * byte de alinhamento dos tamanhos ímpares). Se o tamanho do `data` for 0, 0xFFFFFFFF (gravação em fluxo) ou
 * passar do fim, usa o resto do arquivo. Lança `Error` se não for esse formato.
 */
export function parseWavHeader(buf: Buffer): WavHeader {
  if (buf.length < 12) invalid("curto demais");
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") invalid("sem RIFF/WAVE");

  let sampleRate = 0;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > buf.length) invalid("fmt curto");
      const format = buf.readUInt16LE(body);
      const channels = buf.readUInt16LE(body + 2);
      const bits = buf.readUInt16LE(body + 14);
      if (format !== FORMAT_PCM && format !== FORMAT_EXTENSIBLE) invalid("não é PCM");
      if (channels !== 1) invalid("não é mono");
      if (bits !== 16) invalid("não é 16 bits");
      sampleRate = buf.readUInt32LE(body + 4);
      if (sampleRate <= 0) invalid("taxa zero");
    } else if (id === "data") {
      if (!sampleRate) invalid("data antes do fmt");
      const available = buf.length - body;
      const length = size === 0 || size === 0xffffffff || size > available ? available : size;
      return { sampleRate, dataOffset: body, sampleCount: Math.floor(length / 2) };
    }
    offset = body + size + (size % 2);
  }
  return invalid(sampleRate ? "sem data" : "sem fmt");
}

/**
 * As amostras de um WAV já lido: uma VISTA sobre os bytes do próprio Buffer (sem cópia nem laço por amostra)
 * quando o início dos dados cai num endereço par — sempre, no cabeçalho de 44 bytes do Piper. Num deslocamento
 * ímpar (Buffer fatiado) só os bytes das amostras são copiados. Mexer na vista mexe no Buffer.
 */
export function wavSamples(buf: Buffer, header: WavHeader): Int16Array {
  const start = buf.byteOffset + header.dataOffset;
  const bytes = header.sampleCount * 2;
  if (!LITTLE_ENDIAN) {
    const samples = new Int16Array(header.sampleCount);
    for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(header.dataOffset + i * 2);
    return samples;
  }
  if (start % 2 === 0) return new Int16Array(buf.buffer, start, header.sampleCount);
  return new Int16Array(new Uint8Array(buf.buffer, start, bytes).slice().buffer);
}

/** Lê um WAV PCM mono de 16 bits (ver `parseWavHeader`); as amostras são uma vista sem cópia (`wavSamples`). */
export function parseWav(buf: Buffer): { sampleRate: number; samples: Int16Array } {
  const header = parseWavHeader(buf);
  return { sampleRate: header.sampleRate, samples: wavSamples(buf, header) };
}

/** Monta um WAV PCM mono 16 bits com as amostras dadas. */
export function buildWav(samples: Int16Array, sampleRate: number = DEFAULT_SAMPLE_RATE): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(FORMAT_PCM, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  return buf;
}

/** Número de amostras de `ms` milissegundos na taxa dada. */
export function samplesFor(ms: number, sampleRate: number): number {
  return Math.max(0, Math.round((ms * sampleRate) / 1000));
}

/** WAV de silêncio com `ms` milissegundos (padrão 22 050 Hz). */
export function silenceWav(ms: number, sampleRate: number = DEFAULT_SAMPLE_RATE): Buffer {
  return buildWav(new Int16Array(samplesFor(ms, sampleRate)), sampleRate);
}
