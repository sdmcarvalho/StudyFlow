// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseWav, silenceWav } from "@/features/voz/wav";
import { encodeMp3, mp3WorkerPath } from "@/features/voz/mp3";

/** Cabeçalho WAV PCM mono 16 bits com pedaços extras opcionais antes do `data`. */
function wavWith(samples: number[], sampleRate: number, opts: { extra?: Buffer; dataSize?: number } = {}) {
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii");
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE(sampleRate * 2, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const data = Buffer.alloc(8 + samples.length * 2);
  data.write("data", 0, "ascii");
  data.writeUInt32LE(opts.dataSize ?? samples.length * 2, 4);
  samples.forEach((s, i) => data.writeInt16LE(s, 8 + i * 2));
  const body = Buffer.concat([Buffer.from("WAVE", "ascii"), fmt, opts.extra ?? Buffer.alloc(0), data]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

function listChunk(payload: string) {
  const bytes = Buffer.from(payload, "ascii");
  const padded = bytes.length % 2 === 1 ? Buffer.concat([bytes, Buffer.alloc(1)]) : bytes;
  const head = Buffer.alloc(8);
  head.write("LIST", 0, "ascii");
  head.writeUInt32LE(bytes.length, 4);
  return Buffer.concat([head, padded]);
}

describe("wav", () => {
  it("silenceWav(1000) tem 1 s a 22 050 Hz e parseWav o lê de volta", () => {
    const wav = silenceWav(1000);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.length).toBe(44 + 22050 * 2);
    const { sampleRate, samples } = parseWav(wav);
    expect(sampleRate).toBe(22050);
    expect(samples.length).toBe(22050);
    expect(samples.every((s) => s === 0)).toBe(true);
  });

  it("silenceWav respeita a taxa pedida (16 000 Hz da edresson-low)", () => {
    const { sampleRate, samples } = parseWav(silenceWav(600, 16000));
    expect(sampleRate).toBe(16000);
    expect(samples.length).toBe(9600);
  });

  it("lê as amostras e a taxa do cabeçalho", () => {
    const { sampleRate, samples } = parseWav(wavWith([1, -2, 32767, -32768], 16000));
    expect(sampleRate).toBe(16000);
    expect(Array.from(samples)).toEqual([1, -2, 32767, -32768]);
  });

  it("pula pedaços extras (LIST, inclusive de tamanho ímpar) antes do data", () => {
    const { samples } = parseWav(wavWith([5, 6, 7], 22050, { extra: listChunk("INFOabc") }));
    expect(Array.from(samples)).toEqual([5, 6, 7]);
  });

  it("data com tamanho 0 ou 0xFFFFFFFF (gravação em fluxo) usa o resto do arquivo", () => {
    expect(Array.from(parseWav(wavWith([3, 4], 22050, { dataSize: 0xffffffff })).samples)).toEqual([3, 4]);
    expect(Array.from(parseWav(wavWith([3, 4], 22050, { dataSize: 0 })).samples)).toEqual([3, 4]);
  });

  it("data maior que o arquivo é truncado no que existe", () => {
    expect(Array.from(parseWav(wavWith([8, 9], 22050, { dataSize: 1000 })).samples)).toEqual([8, 9]);
  });

  it("recusa arquivo vazio, sem RIFF/WAVE, sem fmt, estéreo ou que não é 16 bits", () => {
    expect(() => parseWav(Buffer.alloc(0))).toThrow();
    expect(() => parseWav(Buffer.from("not a wav file at all, really not one"))).toThrow();
    const good = wavWith([1], 22050);
    const noRiff = Buffer.from(good);
    noRiff.write("RIFX", 0, "ascii");
    expect(() => parseWav(noRiff)).toThrow();
    const stereo = Buffer.from(good);
    stereo.writeUInt16LE(2, 22);
    expect(() => parseWav(stereo)).toThrow();
    const eightBit = Buffer.from(good);
    eightBit.writeUInt16LE(8, 34);
    expect(() => parseWav(eightBit)).toThrow();
    const noFmt = Buffer.from(good);
    noFmt.write("junk", 12, "ascii");
    expect(() => parseWav(noFmt)).toThrow();
  });
});

const MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Percorre os frames MPEG Layer III do início ao fim; falha se algum cabeçalho for inválido. */
function scanMp3(buf: Buffer) {
  let offset = 0;
  let frames = 0;
  let samples = 0;
  let sampleRate = 0;
  if (buf.subarray(0, 3).toString("latin1") === "ID3") {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    offset = 10 + size;
  }
  while (offset + 4 <= buf.length) {
    const b1 = buf[offset + 1];
    const b2 = buf[offset + 2];
    if (buf[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) throw new Error(`sem sincronismo em ${offset}`);
    const version = (b1 >> 3) & 3;
    const layer = (b1 >> 1) & 3;
    if (version === 1 || layer !== 1) throw new Error(`frame inesperado em ${offset}`);
    const bitrate = (version === 3 ? MPEG1_L3 : MPEG2_L3)[b2 >> 4];
    const rate = RATES[version][(b2 >> 2) & 3];
    if (!bitrate || !rate) throw new Error(`cabeçalho inválido em ${offset}`);
    const padding = (b2 >> 1) & 1;
    const size = Math.floor(((version === 3 ? 144 : 72) * bitrate * 1000) / rate) + padding;
    sampleRate = rate;
    samples += version === 3 ? 1152 : 576;
    frames++;
    offset += size;
  }
  return { frames, sampleRate, seconds: samples / sampleRate, end: offset };
}

describe("mp3", () => {
  it("o worker é um arquivo .mjs que existe", async () => {
    const fs = await import("node:fs");
    expect(mp3WorkerPath().endsWith("mp3-worker.mjs")).toBe(true);
    expect(fs.existsSync(mp3WorkerPath())).toBe(true);
  });

  it("1 s de silêncio vira frames MP3 válidos de ≈ 1,6 s (600 ms de silêncio no fim)", async () => {
    const mp3 = await encodeMp3(silenceWav(1000));
    expect(Buffer.isBuffer(mp3)).toBe(true);
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0);
    const scan = scanMp3(mp3);
    expect(scan.sampleRate).toBe(22050);
    expect(scan.end).toBe(mp3.length);
    expect(scan.seconds).toBeGreaterThan(1.55);
    expect(scan.seconds).toBeLessThan(1.75);
  });

  it("usa a taxa do WAV (16 000 Hz) e o silêncio final pedido", async () => {
    const mp3 = await encodeMp3(silenceWav(1000, 16000), { trailingSilenceMs: 0 });
    const scan = scanMp3(mp3);
    expect(scan.sampleRate).toBe(16000);
    expect(scan.seconds).toBeGreaterThan(0.95);
    expect(scan.seconds).toBeLessThan(1.15);
  });

  it("codifica áudio não silencioso", async () => {
    const samples = Array.from({ length: 22050 }, (_, i) => Math.round(Math.sin(i / 10) * 8000));
    const mp3 = await encodeMp3(wavWith(samples, 22050));
    expect(scanMp3(mp3).frames).toBeGreaterThan(30);
  });

  it("WAV inválido rejeita", async () => {
    await expect(encodeMp3(Buffer.from("nada"))).rejects.toThrow();
  });
});
