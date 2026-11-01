// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { FakeEngine } from "@/features/voz/engine/fake";
import { getEngine } from "@/features/voz/engine/index";
import { PiperEngine, type PiperCommand } from "@/features/voz/engine/piper";
import { VoiceCancelledError, VoiceError, type SpeechItem } from "@/features/voz/engine/types";
import type { VoiceSettings } from "@/features/voz/settings-schema";
import { parseWav } from "@/features/voz/wav";

const VOICE = "pt_BR-faber-medium";
const settings: VoiceSettings = { voice: VOICE, speed: 1, volume: 1 };
const FAKE_PIPER = path.resolve("tests/unit/helpers/fake-piper.mjs");
const fakeCommand: PiperCommand = { file: process.execPath, baseArgs: [FAKE_PIPER] };

const ENV_KEYS = [
  "STUDYFLOW_VOZ_DIR",
  "STUDYFLOW_VOZ_PYTHON",
  "STUDYFLOW_VOZ_ENGINE",
  "FAKE_PIPER_LOG_DIR",
  "FAKE_PIPER_MODE",
  "FAKE_PIPER_DELAY_MS",
] as const;

let root: string;
let vozRoot: string;
let logDir: string;
let tmpRoot: string;
let savedEnv: Record<string, string | undefined>;
let errorSpy: MockInstance<typeof console.error>;

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  root = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-voz-engine-"));
  // Espaço e "&" no caminho: com shell, o comando se partiria aqui.
  vozRoot = path.join(root, "voz & dados");
  logDir = path.join(root, "log");
  tmpRoot = path.join(root, "tmp");
  await fs.mkdir(path.join(vozRoot, "voices"), { recursive: true });
  await fs.mkdir(logDir);
  await fs.mkdir(tmpRoot);
  await fs.writeFile(path.join(vozRoot, "voices", `${VOICE}.onnx`), "x");
  await fs.writeFile(path.join(vozRoot, "voices", `${VOICE}.onnx.json`), "{}");
  process.env.STUDYFLOW_VOZ_DIR = vozRoot;
  process.env.FAKE_PIPER_LOG_DIR = logDir;
  // As falhas do Piper vão para o log do servidor; aqui o log é conferido, não impresso.
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  errorSpy.mockRestore();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
});

type Got = { n: number; wav: Buffer; at: number };

async function run(engine: { synthesize: PiperEngine["synthesize"] }, items: SpeechItem[], opts: { signal?: AbortSignal; s?: VoiceSettings } = {}) {
  const got: Got[] = [];
  await engine.synthesize(items, opts.s ?? settings, opts.signal ?? new AbortController().signal, (n, wav) => {
    got.push({ n, wav, at: Date.now() });
  });
  return got;
}

const piper = () => new PiperEngine(fakeCommand, { tmpRoot });
const readLog = async (name: string) => JSON.parse(await fs.readFile(path.join(logDir, name), "utf8"));

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(file: string) {
  for (let i = 0; i < 200; i++) {
    try {
      return await fs.readFile(file, "utf8");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`não apareceu: ${file}`);
}

describe("PiperEngine (contra o falso executável)", () => {
  it("monta a linha de comando da spec, em lista, sem o texto", async () => {
    await run(piper(), [{ n: 1, text: "Olá mundo" }], { s: { voice: VOICE, speed: 2, volume: 0.8 } });
    const argv: string[] = await readLog("argv.json");
    expect(argv.slice(0, 4)).toEqual(["-m", VOICE, "--data-dir", path.join(vozRoot, "voices")]);
    expect(argv[4]).toBe("-i");
    expect(argv[6]).toBe("-d");
    expect(argv.slice(8)).toEqual(["--length-scale", "0.5", "--volume", "0.8", "--sentence-silence", "0.3"]);
    expect(argv.join(" ")).not.toContain("Olá");
  });

  it("o comando padrão é o Python do ambiente com -I -m piper", () => {
    process.env.STUDYFLOW_VOZ_PYTHON = "C:\\voz\\venv\\Scripts\\python.exe";
    expect(new PiperEngine().command).toEqual({ file: "C:\\voz\\venv\\Scripts\\python.exe", baseArgs: ["-I", "-m", "piper"] });
  });

  it("textos maliciosos chegam intactos pelo arquivo de entrada (quebras e \\0 viram espaço)", async () => {
    const texts = [
      "--rm -rf / --output-file x",
      `"aspas" 'simples' \`crase\``,
      "$(touch pwned) ; & | > nul %PATH%",
      "tab\taqui",
      "ção çã ü 😀 中文 €",
      "linha1\nlinha2\r\nlinha3\0fim\u2028sep",
    ];
    const got = await run(piper(), texts.map((text, i) => ({ n: i + 1, text })));
    const lines: string[] = await readLog("lines.json");
    expect(lines).toEqual([...texts.slice(0, 5), "linha1 linha2  linha3 fim sep"]);
    const argv: string[] = await readLog("argv.json");
    for (const text of texts) expect(argv).not.toContain(text);
    expect(got.map((g) => g.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await fs.readdir(path.dirname(FAKE_PIPER))).not.toContain("pwned");
  });

  it("entrega cada célula na ordem, com o WAV da linha certa", async () => {
    const items = [
      { n: 3, text: "um" },
      { n: 4, text: "dois dois" },
      { n: 7, text: "três três três" },
    ];
    const got = await run(piper(), items);
    expect(got.map((g) => g.n)).toEqual([3, 4, 7]);
    got.forEach((g, i) => expect(parseWav(g.wav).samples.length).toBe(items[i].text.length * 220));
  });

  it("não envia células sem letra nem dígito (o Piper cairia ou deslocaria o mapeamento)", async () => {
    const got = await run(piper(), [
      { n: 1, text: "Oi" },
      { n: 2, text: "..." },
      { n: 3, text: "   " },
      { n: 4, text: "" },
      { n: 5, text: "Tchau" },
    ]);
    expect(await readLog("lines.json")).toEqual(["Oi", "Tchau"]);
    expect(got.map((g) => g.n)).toEqual([1, 5]);
  });

  it("nenhuma célula falável: termina sem iniciar o processo", async () => {
    expect(await run(piper(), [{ n: 1, text: "---" }])).toEqual([]);
    await expect(fs.stat(path.join(logDir, "pid.txt"))).rejects.toThrow();
  });

  it("entrega à medida que o Piper termina cada linha", async () => {
    process.env.FAKE_PIPER_DELAY_MS = "400";
    let finished = 0;
    const promise = run(piper(), [
      { n: 1, text: "a" },
      { n: 2, text: "b" },
      { n: 3, text: "c" },
    ]).then((got) => {
      finished = Date.now();
      return got;
    });
    const got = await promise;
    expect(got).toHaveLength(3);
    expect(finished - got[0].at).toBeGreaterThanOrEqual(600);
  });

  it("caminho estragado no stderr (página de código): mapeia pela ordem dos arquivos", async () => {
    process.env.FAKE_PIPER_MODE = "garbled";
    const got = await run(piper(), [
      { n: 1, text: "curto" },
      { n: 2, text: "bem mais longo" },
    ]);
    expect(got.map((g) => g.n)).toEqual([1, 2]);
    expect(parseWav(got[1].wav).samples.length).toBe("bem mais longo".length * 220);
  });

  it.each(["exit1", "zero", "missing"])("falha do Piper (%s) rejeita com VoiceError em pt-BR e limpa a pasta temporária", async (mode) => {
    process.env.FAKE_PIPER_MODE = mode;
    const error = await run(piper(), [
      { n: 1, text: "um" },
      { n: 2, text: "dois" },
      { n: 3, text: "três" },
    ]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VoiceError);
    expect(error).not.toBeInstanceOf(VoiceCancelledError);
    expect((error as Error).message).toBe("A geração de voz falhou.");
    expect(await fs.readdir(tmpRoot)).toEqual([]);
  });

  it("sucesso também remove o arquivo de entrada e a pasta de saída", async () => {
    await run(piper(), [{ n: 1, text: "oi" }]);
    expect(await fs.readdir(tmpRoot)).toEqual([]);
  });

  it("executável inexistente rejeita com VoiceError", async () => {
    const engine = new PiperEngine({ file: path.join(root, "nao-existe.exe"), baseArgs: [] }, { tmpRoot });
    await expect(run(engine, [{ n: 1, text: "oi" }])).rejects.toThrow(new VoiceError("A geração de voz falhou."));
    expect(await fs.readdir(tmpRoot)).toEqual([]);
  });

  it("voz fora do catálogo não chega ao processo", async () => {
    for (const voice of ["../x", "pt_BR-cadu-medium", "a b"]) {
      await expect(run(piper(), [{ n: 1, text: "oi" }], { s: { ...settings, voice } })).rejects.toBeInstanceOf(VoiceError);
    }
    await expect(fs.stat(path.join(logDir, "pid.txt"))).rejects.toThrow();
  });

  it("abortar mata o processo, rejeita com VoiceCancelledError e limpa a pasta temporária", async () => {
    process.env.FAKE_PIPER_MODE = "hang";
    const controller = new AbortController();
    const promise = run(piper(), [{ n: 1, text: "oi" }], { signal: controller.signal });
    const pid = Number(await waitFor(path.join(logDir, "pid.txt")));
    expect(alive(pid)).toBe(true);
    controller.abort();
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VoiceCancelledError);
    expect((error as Error).message).toBe("Geração cancelada.");
    expect(alive(pid)).toBe(false);
    expect(await fs.readdir(tmpRoot)).toEqual([]);
  });

  it("abortar no meio para de entregar células", async () => {
    process.env.FAKE_PIPER_DELAY_MS = "300";
    const controller = new AbortController();
    const got: number[] = [];
    const error = await piper()
      .synthesize(
        [
          { n: 1, text: "a" },
          { n: 2, text: "b" },
          { n: 3, text: "c" },
        ],
        settings,
        controller.signal,
        (n) => {
          got.push(n);
          controller.abort();
        },
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VoiceCancelledError);
    expect(got).toEqual([1]);
    const pid = Number(await fs.readFile(path.join(logDir, "pid.txt"), "utf8"));
    expect(alive(pid)).toBe(false);
  });

  it("aviso no stderr com \":Wrote \" no meio não conta como progresso", async () => {
    process.env.FAKE_PIPER_MODE = "spoof";
    const items = [
      { n: 1, text: "um" },
      { n: 2, text: "dois dois" },
      { n: 3, text: "três três três" },
    ];
    const got = await run(piper(), items);
    expect(got.map((g) => g.n)).toEqual([1, 2, 3]);
    got.forEach((g, i) => expect(parseWav(g.wav).samples.length).toBe(items[i].text.length * 220));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  const pipeFailure = () =>
    errorSpy.mock.calls.find((call) => call[0] === "Piper falhou:")?.[1] as
      | { reason: string; code: number | null; signal: string | null; stderr: string }
      | undefined;

  it("saída com código ≠ 0: registra o código e o fim do stderr no servidor, sem o texto", async () => {
    process.env.FAKE_PIPER_MODE = "exit1";
    const error = await run(piper(), [
      { n: 1, text: "segredo um" },
      { n: 2, text: "segredo dois" },
    ]).catch((e: unknown) => e);
    expect((error as Error).message).toBe("A geração de voz falhou.");
    const logged = pipeFailure();
    expect(logged).toMatchObject({ code: 1 });
    expect(logged?.stderr).toContain("wave.Error: # channels not specified");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("segredo");
  });

  it("WAV de 0 byte: registra o motivo no servidor", async () => {
    process.env.FAKE_PIPER_MODE = "zero";
    await run(piper(), [
      { n: 1, text: "um" },
      { n: 2, text: "dois" },
    ]).catch(() => {});
    expect(pipeFailure()?.reason).toMatch(/WAV da linha 2/);
  });

  it("onCell que lança: registra no servidor e rejeita com VoiceError", async () => {
    const error = await piper()
      .synthesize([{ n: 5, text: "oi" }], settings, new AbortController().signal, () => {
        throw new Error("quebrou no consumidor");
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VoiceError);
    expect(errorSpy).toHaveBeenCalledWith("Piper: onCell lançou ao entregar a célula", 5, expect.any(Error));
    expect(pipeFailure()?.reason).toBe("onCell lançou");
  });

  it("cancelar não registra falha no servidor", async () => {
    process.env.FAKE_PIPER_MODE = "hang";
    const controller = new AbortController();
    const promise = run(piper(), [{ n: 1, text: "oi" }], { signal: controller.signal });
    await waitFor(path.join(logDir, "pid.txt"));
    controller.abort();
    await promise.catch(() => {});
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("sinal já abortado: rejeita sem iniciar o processo", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(run(piper(), [{ n: 1, text: "oi" }], { signal: controller.signal })).rejects.toBeInstanceOf(VoiceCancelledError);
    await expect(fs.stat(path.join(logDir, "pid.txt"))).rejects.toThrow();
  });
});

describe("FakeEngine", () => {
  it("chama onCell uma vez por item, na ordem, com WAV válido de 22 050 Hz proporcional ao texto", async () => {
    const got = await run(new FakeEngine(), [
      { n: 2, text: "a" },
      { n: 5, text: "x".repeat(10) },
    ]);
    expect(got.map((g) => g.n)).toEqual([2, 5]);
    const short = parseWav(got[0].wav);
    const long = parseWav(got[1].wav);
    expect(short.sampleRate).toBe(22050);
    expect(short.samples.length).toBe(Math.round(0.2 * 22050));
    expect(long.samples.length).toBe(Math.round(0.6 * 22050));
  });

  it("é determinístico", async () => {
    const a = await run(new FakeEngine(), [{ n: 1, text: "Olá" }]);
    const b = await run(new FakeEngine(), [{ n: 1, text: "Olá" }]);
    expect(a[0].wav.equals(b[0].wav)).toBe(true);
  });

  it("ignora células sem letra nem dígito, como o Piper", async () => {
    const got = await run(new FakeEngine(), [
      { n: 1, text: "..." },
      { n: 2, text: "ok" },
    ]);
    expect(got.map((g) => g.n)).toEqual([2]);
  });

  it("respeita signal.aborted: para de chamar e rejeita com VoiceCancelledError", async () => {
    const controller = new AbortController();
    const got: number[] = [];
    const error = await new FakeEngine()
      .synthesize(
        [1, 2, 3].map((n) => ({ n, text: `célula ${n}` })),
        settings,
        controller.signal,
        (n) => {
          got.push(n);
          if (n === 1) controller.abort();
        },
      )
      .catch((e: unknown) => e);
    expect(got).toEqual([1]);
    expect(error).toBeInstanceOf(VoiceCancelledError);
  });
});

describe("getEngine", () => {
  it("STUDYFLOW_VOZ_ENGINE=fake devolve o motor falso, mesmo sem Python", async () => {
    process.env.STUDYFLOW_VOZ_ENGINE = "fake";
    expect(await getEngine()).toBeInstanceOf(FakeEngine);
  });

  it("sem STUDYFLOW_VOZ_PYTHON e sem fake: null", async () => {
    expect(await getEngine()).toBeNull();
    process.env.STUDYFLOW_VOZ_ENGINE = "piper";
    expect(await getEngine()).toBeNull();
  });

  it("Python inexistente: null", async () => {
    process.env.STUDYFLOW_VOZ_PYTHON = path.join(root, "nao-existe.exe");
    expect(await getEngine()).toBeNull();
  });

  it("Python existe mas nenhuma voz instalada: null", async () => {
    process.env.STUDYFLOW_VOZ_PYTHON = process.execPath;
    await fs.rm(path.join(vozRoot, "voices"), { recursive: true });
    expect(await getEngine()).toBeNull();
  });

  it("Python existe e há voz: PiperEngine com esse Python", async () => {
    process.env.STUDYFLOW_VOZ_PYTHON = process.execPath;
    const engine = await getEngine();
    expect(engine).toBeInstanceOf(PiperEngine);
    expect((engine as PiperEngine).command.file).toBe(process.execPath);
  });
});
