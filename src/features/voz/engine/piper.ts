// Motor Piper 1.8.0: um processo `python -I -m piper` por tarefa, com uma célula por linha de um arquivo UTF-8
// (`-i`) e um WAV por linha numa pasta temporária (`-d`). Contrato medido na Tarefa 1 (ver a spec):
// - cada linha concluída escreve `INFO:__main__:Wrote <caminho>.wav` no stderr, na ordem das linhas: a i-ésima
//   linha "Wrote" é o i-ésimo item enviado, e o WAV é lido e entregue nesse momento (progresso real);
// - linha vazia é ignorada e linha só de pontuação derruba o processo (código 1, WAV de 0 byte), por isso só
//   vão itens com letra ou dígito (`speakableItems`); os demais não recebem `onCell`;
// - saída com código ≠ 0, WAV vazio ou inválido, ou menos arquivos que itens: `VoiceError` genérico em pt-BR.
// Segurança: argumentos sempre em lista, sem shell; o texto só vai pelo arquivo de entrada; a voz precisa estar
// no catálogo instalado. Cancelar (`signal`) mata o processo (no Windows a árvore, pois o python.exe do venv é
// um lançador que cria outro processo) e rejeita com `VoiceCancelledError`. A pasta temporária (entrada e
// saída) é apagada no fim, em qualquer caso. Só para o servidor.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isInstalledVoice, vozDir, voicesDir } from "@/features/voz/engine/catalog";
import { SPEED_MAX, SPEED_MIN, VOLUME_MAX, VOLUME_MIN, type VoiceSettings } from "@/features/voz/settings-schema";
import { parseWav } from "@/features/voz/wav";
import { speakableItems, VoiceCancelledError, VoiceError, type SpeechEngine, type SpeechItem } from "./types";

/** Executável e argumentos iniciais; o motor acrescenta os do Piper. Injetável para testes (R2b). */
export type PiperCommand = { file: string; baseArgs: string[] };

/** Pausa entre as frases de uma mesma célula, em segundos (`--sentence-silence`; o padrão do Piper é 0). */
export const SENTENCE_SILENCE_S = 0.3;
/** Prioridade baixa (nice 10) para não atrapalhar os outros serviços da VPS. */
const LOW_PRIORITY = 10;

export const MSG_VOICE_NOT_INSTALLED_ENGINE = "A voz escolhida não está instalada. Escolha outra em Configuração.";

/**
 * Python do venv criado por `npm run voz:install` (mesmo layout de `planInstall`): `<pasta de voz>/venv/Scripts/python.exe`
 * no Windows e `<pasta de voz>/venv/bin/python` nos demais. `platform` é injetável para teste.
 */
export function venvPython(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32"
    ? path.join(vozDir(), "venv", "Scripts", "python.exe")
    : path.join(vozDir(), "venv", "bin", "python");
}

/** `STUDYFLOW_VOZ_PYTHON` (quando definido e não vazio) vence; senão, o Python do venv da instalação (R16). */
export function defaultPiperCommand(platform: NodeJS.Platform = process.platform): PiperCommand {
  const file = process.env.STUDYFLOW_VOZ_PYTHON?.trim() || venvPython(platform);
  return { file, baseArgs: ["-I", "-m", "piper"] };
}

// Ancorado no início: texto do usuário ecoado no stderr (aviso, traceback) não conta como progresso.
const WROTE = /^INFO:[\w.]+:Wrote (.+)$/;
const WAV_NAME = /^\d+\.wav$/;
const MAX_STDERR_LINE = 64 * 1024;
/** Quanto do fim do stderr vai para o log do servidor quando o Piper falha. */
const STDERR_TAIL = 4 * 1024;

function inside(dir: string, file: string): boolean {
  const relative = path.relative(dir, file);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * Arquivo da i-ésima linha. Usa o caminho do "Wrote" quando ele existe dentro da pasta de saída; se veio
 * estragado (o stderr do Python no Windows sai na página de código do sistema, e um acento na pasta
 * temporária o corrompe), usa o i-ésimo arquivo em ordem numérica (os nomes são `time.monotonic_ns()`).
 */
async function locate(outDir: string, cwd: string, reported: string, index: number): Promise<string> {
  const candidate = path.resolve(cwd, reported);
  if (inside(outDir, candidate) && (await isFile(candidate))) return candidate;
  const names = (await fs.readdir(outDir)).filter((name) => WAV_NAME.test(name));
  names.sort((a, b) => {
    const x = BigInt(a.slice(0, -4));
    const y = BigInt(b.slice(0, -4));
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const name = names[index];
  if (!name) throw new Error("WAV da linha não encontrado");
  return path.join(outDir, name);
}

/** Encerra o processo; no Windows, a árvore inteira (`taskkill /T /F`), e só então o próprio filho. */
function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    const taskkill = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
    const killer = spawn(taskkill, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    killer.on("error", () => child.kill());
    killer.on("close", (code) => {
      if (code !== 0) child.kill();
    });
    return;
  }
  child.kill("SIGKILL");
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}

export class PiperEngine implements SpeechEngine {
  readonly command: PiperCommand;
  private readonly tmpRoot: string;

  constructor(command: PiperCommand = defaultPiperCommand(), options: { tmpRoot?: string } = {}) {
    this.command = command;
    this.tmpRoot = options.tmpRoot ?? os.tmpdir();
  }

  async synthesize(
    items: SpeechItem[],
    settings: VoiceSettings,
    signal: AbortSignal,
    onCell: (n: number, wav: Buffer) => void,
  ): Promise<void> {
    if (signal.aborted) throw new VoiceCancelledError();
    const queue = speakableItems(items);
    if (queue.length === 0) return;
    if (!(await isInstalledVoice(settings.voice))) throw new VoiceError(MSG_VOICE_NOT_INSTALLED_ENGINE);
    const { speed, volume } = settings;
    if (!(speed >= SPEED_MIN && speed <= SPEED_MAX) || !(volume >= VOLUME_MIN && volume <= VOLUME_MAX)) {
      throw new VoiceError();
    }
    if (!this.command.file) throw new VoiceError();

    let work: string;
    try {
      work = await fs.mkdtemp(path.join(this.tmpRoot, "studyflow-voz-"));
    } catch {
      throw new VoiceError();
    }
    try {
      const input = path.join(work, "celulas.txt");
      const outDir = path.join(work, "saida");
      await fs.writeFile(input, `${queue.map((item) => item.text).join("\n")}\n`, "utf8");
      await fs.mkdir(outDir);
      const args = [
        ...this.command.baseArgs,
        "-m", settings.voice,
        "--data-dir", voicesDir(),
        "-i", input,
        "-d", outDir,
        "--length-scale", formatNumber(1 / speed),
        "--volume", formatNumber(volume),
        "--sentence-silence", formatNumber(SENTENCE_SILENCE_S),
      ];
      await this.run(args, work, outDir, queue, signal, onCell);
    } catch (error) {
      if (error instanceof VoiceError) throw error;
      throw new VoiceError();
    } finally {
      await fs.rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
    }
  }

  private run(
    args: string[],
    cwd: string,
    outDir: string,
    queue: SpeechItem[],
    signal: AbortSignal,
    onCell: (n: number, wav: Buffer) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new VoiceCancelledError());
        return;
      }
      let child: ChildProcess;
      try {
        child = spawn(this.command.file, args, { cwd, shell: false, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      } catch {
        reject(new VoiceError());
        return;
      }

      let failed = false;
      let settled = false;
      let wrote = 0;
      let delivered = 0;
      let pending = "";
      let chain: Promise<void> = Promise.resolve();
      // Fim do stderr, só para o log do servidor em caso de falha (o usuário vê a mensagem genérica).
      let stderrTail = "";
      let reason: string | null = null;

      const stop = () => killTree(child);
      const fail = (why: string) => {
        failed = true;
        reason ??= why;
        stop();
      };
      const onAbort = () => stop();
      signal.addEventListener("abort", onAbort, { once: true });

      const settle = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        outcome();
      };

      const deliver = async (index: number, reported: string) => {
        if (failed || signal.aborted) return;
        let wav: Buffer;
        try {
          const file = await locate(outDir, cwd, reported, index);
          wav = await fs.readFile(file);
          if (parseWav(wav).samples.length === 0) throw new Error("WAV vazio");
        } catch (error) {
          fail(`WAV da linha ${index + 1} ausente, vazio ou inválido (${error instanceof Error ? error.message : "erro"})`);
          return;
        }
        if (failed || signal.aborted) return;
        delivered++;
        try {
          onCell(queue[index].n, wav);
        } catch (error) {
          console.error("Piper: onCell lançou ao entregar a célula", queue[index].n, error);
          fail("onCell lançou");
        }
      };

      const onLine = (line: string) => {
        const match = WROTE.exec(line.replace(/\r$/, ""));
        if (!match) return;
        const index = wrote++;
        if (index >= queue.length) {
          fail(`linha "Wrote" a mais (${index + 1} para ${queue.length} itens)`);
          return;
        }
        chain = chain.then(() => deliver(index, match[1].trim()));
      };

      // Nunca chamar com pid 0/indefinido: isso mudaria a prioridade do próprio servidor.
      if (child.pid) {
        try {
          os.setPriority(child.pid, LOW_PRIORITY);
        } catch {
          // Melhor esforço: sem permissão ou processo já encerrado.
        }
      }

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL);
        pending += chunk;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        if (pending.length > MAX_STDERR_LINE) pending = "";
        for (const line of lines) onLine(line);
      });

      child.on("error", (error) => {
        failed = true;
        reason ??= `erro do processo: ${error.message}`;
        if (child.pid === undefined) {
          console.error("Piper falhou ao iniciar:", error.message);
          settle(() => reject(new VoiceError()));
        }
      });

      child.on("close", (code, exitSignal) => {
        if (pending) onLine(pending);
        pending = "";
        void chain.then(() =>
          settle(() => {
            if (signal.aborted) {
              reject(new VoiceCancelledError());
              return;
            }
            if (failed || code !== 0 || delivered !== queue.length) {
              // Só o motivo, o código e o fim do stderr; nunca o texto de entrada.
              console.error("Piper falhou:", {
                reason: reason ?? (code !== 0 ? "código de saída diferente de 0" : `entregou ${delivered} de ${queue.length}`),
                code,
                signal: exitSignal,
                stderr: stderrTail,
              });
              reject(new VoiceError());
              return;
            }
            resolve();
          }),
        );
      });
    });
  }
}
