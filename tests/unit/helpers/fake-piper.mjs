// Falso executável do Piper 1.8.0 para os testes de `engine/piper.ts`. Imita o contrato medido na Tarefa 1:
// lê o arquivo de `-i` em UTF-8, uma frase por linha (linhas vazias são ignoradas), grava um WAV por linha em
// `-d` com nome `<monotonic_ns>.wav` e escreve `INFO:__main__:Wrote <caminho>` no stderr depois de cada um.
// Nada vai para o stdout.
//
// Comportamento extra, pelo ambiente (o motor repassa `process.env` ao processo):
//   FAKE_PIPER_LOG_DIR  pasta onde gravar `argv.json` (argumentos recebidos), `lines.json` (linhas lidas) e
//                       `pid.txt` (pid deste processo), para o teste conferir.
//   FAKE_PIPER_DELAY_MS espera entre uma linha e a seguinte (padrão 0).
//   FAKE_PIPER_MODE     "ok" (padrão) | "exit1" (grava a 1ª linha, deixa um WAV de 0 byte na 2ª e sai com
//                       código 1, como a linha só de pontuação) | "zero" (o WAV da 2ª linha tem 0 byte, com "Wrote", e sai com 0) |
//                       "missing" (sai com 0 sem gravar a última linha) | "hang" (grava o pid e fica parado) |
//                       "garbled" (o caminho do "Wrote" sai estragado, como acento em página de código errada) |
//                       "spoof" (antes de cada "Wrote" de verdade, um aviso `WARNING:x:something :Wrote nothing`).
import fs from "node:fs";
import path from "node:path";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function silenceWav(samples, sampleRate) {
  const dataBytes = samples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logDir = process.env.FAKE_PIPER_LOG_DIR;
const mode = process.env.FAKE_PIPER_MODE || "ok";
const delay = Number(process.env.FAKE_PIPER_DELAY_MS || "0");

if (logDir) {
  fs.writeFileSync(path.join(logDir, "pid.txt"), String(process.pid));
  fs.writeFileSync(path.join(logDir, "argv.json"), JSON.stringify(process.argv.slice(2)));
}

if (mode === "hang") {
  setInterval(() => {}, 1000);
} else {
  const input = option("-i");
  const outDir = option("-d");
  const lines = fs
    .readFileSync(input, "utf8")
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (logDir) fs.writeFileSync(path.join(logDir, "lines.json"), JSON.stringify(lines));
  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < lines.length; i++) {
    if (i > 0 && delay > 0) await sleep(delay);
    if (mode === "missing" && i === lines.length - 1) break;
    const file = path.join(outDir, `${process.hrtime.bigint()}.wav`);
    const empty = (mode === "zero" || mode === "exit1") && i === 1;
    // Duração proporcional ao texto (10 ms por caractere), para o teste distinguir as células.
    fs.writeFileSync(file, empty ? Buffer.alloc(0) : silenceWav(lines[i].length * 220, 22050));
    if (mode === "exit1" && i === 1) {
      process.stderr.write("wave.Error: # channels not specified\n");
      process.exit(1);
    }
    // "spoof": antes de cada linha, um aviso com o texto do usuário ecoado que contém ":Wrote " no meio.
    if (mode === "spoof") process.stderr.write(`WARNING:x:something :Wrote nothing ${lines[i]}\n`);
    const shown = mode === "garbled" ? file.replace(/\.wav$/, "�.wav") : file;
    process.stderr.write(`INFO:__main__:Wrote ${shown}\n`);
  }
}
