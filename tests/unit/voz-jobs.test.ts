// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => import("./helpers/next-headers"));
// O motor vem da fábrica real por padrão; cada teste pode trocar por um motor controlado (com espião).
vi.mock("@/features/voz/engine/index", () => ({ getEngine: vi.fn() }));

import { getEngine } from "@/features/voz/engine/index";
import { FakeEngine } from "@/features/voz/engine/fake";
import { VoiceCancelledError, VoiceError, type SpeechEngine, type SpeechItem } from "@/features/voz/engine/types";
import {
  _resetJobsForTests,
  cancelJob,
  createJob,
  getCellMp3,
  getFullMp3,
  getJobStatus,
  synthesizeSample,
  type JobStatus,
} from "@/features/voz/jobs";
import { MSG_FEW_CELLS } from "@/features/voz/range";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

const VOICE = "pt_BR-faber-medium";
const ENV_KEYS = ["STUDYFLOW_VOZ_ENGINE", "STUDYFLOW_VOZ_DIR", "STUDYFLOW_VOZ_MAX_CHARS", "STUDYFLOW_VOZ_JOB_TIMEOUT_MS"];
const NO_TEXT = "As células escolhidas não têm texto para ler.";
const BUSY = "Você já tem uma voz em andamento.";
const NOT_INSTALLED_ENV = "A voz não está instalada neste ambiente.";
const VOICE_MISSING = "A voz escolhida não está instalada. Escolha outra em Configuração.";

type Person = Awaited<ReturnType<typeof createTestUser>>;

// O worker do MP3 leva algumas centenas de ms para subir em cada célula.
vi.setConfig({ testTimeout: 30_000 });

let savedEnv: Record<string, string | undefined>;
let vozRoot: string;
let calls: SpeechItem[][];
let errorSpy: MockInstance<typeof console.error>;
const generationLogs = () => errorSpy.mock.calls.filter((call) => call[0] === "Falha na geração de voz:");

/** FakeEngine com espião: guarda os itens de cada chamada. */
function spyEngine(): SpeechEngine {
  const real = new FakeEngine();
  return {
    synthesize: (items, settings, signal, onCell) => {
      calls.push(items.map((item) => ({ ...item })));
      return real.synthesize(items, settings, signal, onCell);
    },
  };
}

/** Motor que só começa quando `release()` é chamado (ou rejeita com o cancelamento, se abortar antes). */
function gatedEngine(failWith?: Error) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let started = 0;
  const engine: SpeechEngine = {
    synthesize: async (items, settings, signal, onCell) => {
      started += 1;
      calls.push(items.map((item) => ({ ...item })));
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(new VoiceCancelledError());
        signal.addEventListener("abort", () => reject(new VoiceCancelledError()), { once: true });
        void gate.then(resolve);
      });
      if (failWith) throw failWith;
      return new FakeEngine().synthesize(items, settings, signal, onCell);
    },
  };
  return { engine, release: () => release(), started: () => started };
}

async function clearUsers() {
  await db.schedule.deleteMany();
  await db.cardResult.deleteMany();
  await db.card.deleteMany();
  await db.studyRecord.deleteMany();
  await db.aiSettings.deleteMany();
  await db.voiceSettings.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
}

async function makeStudy(user: Person, texts: string[], extra: { deletedAt?: Date; descricao?: string } = {}) {
  const cells = texts.map((texto, i) => ({ id: `c${i + 1}`, texto }));
  const study = await db.studyRecord.create({
    data: {
      userId: user.id,
      descricao: extra.descricao ?? "Estudo de voz",
      pasta: path.join(vozRoot, "pasta"),
      dataInicial: "2026-10-31",
      conteudo: JSON.stringify(cells),
      deletedAt: extra.deletedAt ?? null,
    },
  });
  return study.id;
}

// setImmediate e performance.now não são falsificados (ver `fake`): servem de relógio real mesmo com timers falsos.
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const FINAL = ["pronto", "erro", "cancelado"];

/** Deixa o I/O real (disco, banco, worker do MP3) andar por `ms` de relógio real. */
async function realWait(ms: number): Promise<void> {
  const until = performance.now() + ms;
  while (performance.now() < until) await tick();
}

/** Espera a tarefa terminar consultando o status (o que também a mantém viva). */
async function waitDone(userId: string, id: string, ms = 15_000): Promise<JobStatus> {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    const status = getJobStatus(userId, id);
    if (status && FINAL.includes(status.state)) return status;
    await tick();
  }
  throw new Error(`a tarefa não terminou: ${JSON.stringify(getJobStatus(userId, id))}`);
}

async function create(user: Person, studyId: string, start: unknown, end: unknown, mode: "ler" | "gravar" = "gravar") {
  await signInAs(user);
  return createJob(user.id, { studyId, start, end, mode });
}

async function createOk(user: Person, studyId: string, start: unknown, end: unknown, mode: "ler" | "gravar" = "gravar") {
  const result = await create(user, studyId, start, end, mode);
  if (!result.ok) throw new Error(`createJob falhou: ${result.status} ${result.message}`);
  return result.id;
}

let userA: Person;
let userB: Person;

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  vozRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-voz-jobs-"));
  process.env.STUDYFLOW_VOZ_DIR = vozRoot;
  process.env.STUDYFLOW_VOZ_ENGINE = "fake";
  calls = [];
  // Falhas de geração vão para o log do servidor; aqui o log é conferido, não impresso.
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getEngine).mockReset();
  vi.mocked(getEngine).mockImplementation(async () => spyEngine());
  _resetJobsForTests();
  await clearUsers();
  signOut();
  userA = await createTestUser({ name: "Ana" });
  userB = await createTestUser({ name: "Beto" });
});

afterEach(async () => {
  _resetJobsForTests();
  vi.useRealTimers();
  errorSpy.mockRestore();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  // Workers do MP3 de tarefas abortadas podem terminar depois; o rm com force aguenta.
  await fs.rm(vozRoot, { recursive: true, force: true, maxRetries: 5 });
});

const TEXTS = ["Primeira célula.", "![só imagem](foto.png)", "Terceira célula com texto.", "Quarta."];

describe("createJob: validação", () => {
  it("modo ou studyId inválidos dão 400", async () => {
    const studyId = await makeStudy(userA, TEXTS);
    await signInAs(userA);
    expect(await createJob(userA.id, { studyId, start: 1, end: 2, mode: "falar" as never })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await createJob(userA.id, { studyId: 42 as never, start: 1, end: 2, mode: "ler" })).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("Estudo de outro usuário, excluído ou inexistente dá 404", async () => {
    const ofA = await makeStudy(userA, TEXTS);
    const trashed = await makeStudy(userB, TEXTS, { deletedAt: new Date() });
    const notFound = { ok: false, status: 404, message: "Estudo não encontrado." };
    expect(await create(userB, ofA, 1, 2)).toEqual(notFound);
    expect(await create(userB, trashed, 1, 2)).toEqual(notFound);
    expect(await create(userB, "nao-existe", 1, 2)).toEqual(notFound);
    expect(calls).toEqual([]);
  });

  it("intervalo inválido dá 400 com a mensagem do range; N < 2 dá MSG_FEW_CELLS", async () => {
    const studyId = await makeStudy(userA, TEXTS);
    expect(await create(userA, studyId, "1e2", 4)).toEqual({ ok: false, status: 400, message: "Use um número inteiro." });
    expect(await create(userA, studyId, 4, 4)).toEqual({
      ok: false,
      status: 400,
      message: "A célula inicial deve estar entre 1 e 3.",
    });
    expect(await create(userA, studyId, 2, 2)).toEqual({
      ok: false,
      status: 400,
      message: "A célula final deve estar entre 3 e 4.",
    });
    const single = await makeStudy(userA, ["Só uma."]);
    expect(await create(userA, single, 1, 2)).toEqual({ ok: false, status: 400, message: MSG_FEW_CELLS });
    expect(calls).toEqual([]);
  });

  it("intervalo sem texto falável dá 400", async () => {
    const studyId = await makeStudy(userA, ["![a](a.png)", "", "..."]);
    expect(await create(userA, studyId, 1, 3)).toEqual({ ok: false, status: 400, message: NO_TEXT });
  });

  it("acima de STUDYFLOW_VOZ_MAX_CHARS dá 400 com os números agrupados", async () => {
    process.env.STUDYFLOW_VOZ_MAX_CHARS = "1000";
    const studyId = await makeStudy(userA, ["a".repeat(800), "b".repeat(700)]);
    expect(await create(userA, studyId, 1, 2)).toEqual({
      ok: false,
      status: 400,
      message: "O trecho tem 1 500 caracteres; o limite é 1 000. Escolha menos células.",
    });
    process.env.STUDYFLOW_VOZ_MAX_CHARS = "1500";
    expect((await create(userA, studyId, 1, 2)).ok).toBe(true);
  });

  it("o limite padrão é 60 000", async () => {
    const studyId = await makeStudy(userA, ["a".repeat(40_000), "b".repeat(20_001)]);
    expect(await create(userA, studyId, 1, 2)).toEqual({
      ok: false,
      status: 400,
      message: "O trecho tem 60 001 caracteres; o limite é 60 000. Escolha menos células.",
    });
  });

  it("sem motor dá 503", async () => {
    vi.mocked(getEngine).mockResolvedValue(null);
    const studyId = await makeStudy(userA, TEXTS);
    expect(await create(userA, studyId, 1, 4)).toEqual({ ok: false, status: 503, message: NOT_INSTALLED_ENV });
  });

  it("motor real com a voz salva não instalada dá 503; instalada passa (o falso não exige)", async () => {
    delete process.env.STUDYFLOW_VOZ_ENGINE;
    const studyId = await makeStudy(userA, TEXTS);
    expect(await create(userA, studyId, 1, 4)).toEqual({ ok: false, status: 503, message: VOICE_MISSING });

    await fs.mkdir(path.join(vozRoot, "voices"), { recursive: true });
    await fs.writeFile(path.join(vozRoot, "voices", `${VOICE}.onnx`), "x");
    await fs.writeFile(path.join(vozRoot, "voices", `${VOICE}.onnx.json`), "{}");
    expect((await create(userA, studyId, 1, 4)).ok).toBe(true);
  });

  it("segunda tarefa ativa do mesmo usuário dá 409; depois de terminar, pode criar outra", async () => {
    const gated = gatedEngine();
    vi.mocked(getEngine).mockResolvedValueOnce(gated.engine);
    const studyId = await makeStudy(userA, TEXTS);
    const id = await createOk(userA, studyId, 1, 4);
    expect(await create(userA, studyId, 1, 4, "ler")).toEqual({ ok: false, status: 409, message: BUSY });
    gated.release();
    expect((await waitDone(userA.id, id)).state).toBe("pronto");
    expect((await create(userA, studyId, 1, 3, "ler")).ok).toBe(true);
  });

  it("clique duplo: duas criações simultâneas do mesmo usuário geram só uma tarefa", async () => {
    const studyId = await makeStudy(userA, TEXTS);
    await signInAs(userA);
    const [first, second] = await Promise.all([
      createJob(userA.id, { studyId, start: 1, end: 4, mode: "gravar" }),
      createJob(userA.id, { studyId, start: 1, end: 4, mode: "gravar" }),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect(first.ok ? second : first).toEqual({ ok: false, status: 409, message: BUSY });
  });
});

describe("createJob: geração", () => {
  it("conclui: células sem texto ficam fora do total, readyCells em ordem, feitas = total", async () => {
    const studyId = await makeStudy(userA, TEXTS);
    const id = await createOk(userA, studyId, 1, 4);
    const status = await waitDone(userA.id, id);
    expect(status).toEqual({ id, mode: "gravar", state: "pronto", total: 3, feitas: 3, readyCells: [1, 3, 4] });
    expect(calls).toHaveLength(1);
    expect(calls[0].map((item) => item.n)).toEqual([1, 3, 4]);
  });

  it("readyCells cresce à medida que as células ficam prontas", async () => {
    const studyId = await makeStudy(userA, ["Um.", "Dois.", "Três.", "Quatro.", "Cinco."]);
    const id = await createOk(userA, studyId, 1, 5, "ler");
    const seen: number[][] = [];
    const until = performance.now() + 15_000;
    while (performance.now() < until) {
      const status = getJobStatus(userA.id, id)!;
      const last = seen[seen.length - 1];
      if (!last || last.length !== status.readyCells.length) seen.push([...status.readyCells]);
      expect(status.feitas).toBe(status.readyCells.length);
      if (status.state === "pronto") break;
      await tick();
    }
    expect(seen[seen.length - 1]).toEqual([1, 2, 3, 4, 5]);
    for (const list of seen) expect(list).toEqual([1, 2, 3, 4, 5].slice(0, list.length));
  });

  it("o motor só recebe as células que não estão no cache; repetição idêntica não chama o motor", async () => {
    const studyId = await makeStudy(userA, TEXTS);
    const first = await createOk(userA, studyId, 1, 3, "ler");
    await waitDone(userA.id, first);
    expect(calls.map((items) => items.map((item) => item.n))).toEqual([[1, 3]]);

    const second = await createOk(userA, studyId, 1, 4, "gravar");
    expect((await waitDone(userA.id, second)).readyCells).toEqual([1, 3, 4]);
    expect(calls.map((items) => items.map((item) => item.n))).toEqual([[1, 3], [4]]);

    const third = await createOk(userA, studyId, 1, 4, "gravar");
    expect(await waitDone(userA.id, third)).toMatchObject({ state: "pronto", feitas: 3, readyCells: [1, 3, 4] });
    expect(calls).toHaveLength(2);
  });

  it("Ler = Gravar: mesmos bytes por célula e getFullMp3 = concatenação na ordem", async () => {
    const studyId = await makeStudy(userA, TEXTS, { descricao: 'Física: "ondas"' });
    const ler = await createOk(userA, studyId, 1, 4, "ler");
    await waitDone(userA.id, ler);
    const lerCells = [1, 3, 4].map((n) => getCellMp3(userA.id, ler, n)!);
    expect(lerCells.every((mp3) => Buffer.isBuffer(mp3) && mp3.length > 0)).toBe(true);
    expect(getFullMp3(userA.id, ler)).toBeNull(); // só no modo gravar

    // Sem cache: o Gravar gera de novo e precisa dar os mesmos bytes.
    await fs.rm(path.join(vozRoot, "cache"), { recursive: true, force: true });
    const gravar = await createOk(userA, studyId, 1, 4, "gravar");
    await waitDone(userA.id, gravar);
    expect(calls).toHaveLength(2);
    const gravarCells = [1, 3, 4].map((n) => getCellMp3(userA.id, gravar, n)!);
    gravarCells.forEach((mp3, i) => expect(mp3.equals(lerCells[i])).toBe(true));

    const full = getFullMp3(userA.id, gravar)!;
    expect(full.fileName).toBe("Física- -ondas- - células 1 a 4.mp3");
    expect(full.mp3.equals(Buffer.concat(gravarCells))).toBe(true);
    expect(getCellMp3(userA.id, gravar, 2)).toBeNull(); // célula sem texto
    expect(getCellMp3(userA.id, gravar, 9)).toBeNull();
  });

  it("getFullMp3 só depois de pronto", async () => {
    const gated = gatedEngine();
    vi.mocked(getEngine).mockResolvedValueOnce(gated.engine);
    const studyId = await makeStudy(userA, TEXTS);
    const id = await createOk(userA, studyId, 1, 4);
    expect(getFullMp3(userA.id, id)).toBeNull();
    gated.release();
    await waitDone(userA.id, id);
    expect(getFullMp3(userA.id, id)).not.toBeNull();
  });

  it("tarefas de dois usuários: a segunda fica na fila e roda depois", async () => {
    const gatedA = gatedEngine();
    vi.mocked(getEngine).mockResolvedValueOnce(gatedA.engine);
    const studyA = await makeStudy(userA, TEXTS);
    const studyB = await makeStudy(userB, ["Texto de B.", "Mais de B."]);
    const idA = await createOk(userA, studyA, 1, 4);
    const idB = await createOk(userB, studyB, 1, 2);
    expect(getJobStatus(userA.id, idA)?.state).toBe("gerando");
    expect(getJobStatus(userB.id, idB)).toMatchObject({ state: "na-fila", total: 2, feitas: 0, readyCells: [] });
    gatedA.release();
    expect((await waitDone(userA.id, idA)).state).toBe("pronto");
    expect(await waitDone(userB.id, idB)).toMatchObject({ state: "pronto", readyCells: [1, 2] });
  });

  it("falha do motor vira erro com a mensagem do VoiceError e a fila segue", async () => {
    const failing = gatedEngine(new VoiceError("O Piper parou no meio."));
    vi.mocked(getEngine).mockResolvedValueOnce(failing.engine);
    const studyA = await makeStudy(userA, TEXTS);
    const studyB = await makeStudy(userB, ["Texto de B.", "Mais de B."]);
    const idA = await createOk(userA, studyA, 1, 4);
    const idB = await createOk(userB, studyB, 1, 2);
    failing.release();
    expect(await waitDone(userA.id, idA)).toMatchObject({ state: "erro", message: "O Piper parou no meio." });
    expect((await waitDone(userB.id, idB)).state).toBe("pronto");
    expect(generationLogs()).toEqual([["Falha na geração de voz:", expect.objectContaining({ message: "O Piper parou no meio." })]]);
  });

  it("erro que não é VoiceError vira a mensagem genérica", async () => {
    const failing = gatedEngine(new Error("detalhe interno /caminho/secreto"));
    vi.mocked(getEngine).mockResolvedValueOnce(failing.engine);
    const studyId = await makeStudy(userA, TEXTS);
    const id = await createOk(userA, studyId, 1, 4);
    failing.release();
    expect(await waitDone(userA.id, id)).toMatchObject({ state: "erro", message: "A geração de voz falhou." });
    // O detalhe interno não vai para o usuário, mas fica no log do servidor.
    expect(generationLogs()).toEqual([
      ["Falha na geração de voz:", expect.objectContaining({ message: "detalhe interno /caminho/secreto" })],
    ]);
  });

  it("cancelJob aborta a geração e o estado vira cancelado", async () => {
    const gated = gatedEngine();
    vi.mocked(getEngine).mockResolvedValueOnce(gated.engine);
    const studyId = await makeStudy(userA, TEXTS);
    const id = await createOk(userA, studyId, 1, 4);
    expect(getJobStatus(userA.id, id)?.state).toBe("gerando");
    expect(cancelJob(userB.id, id)).toBe(false);
    expect(cancelJob(userA.id, id)).toBe(true);
    expect(getJobStatus(userA.id, id)?.state).toBe("cancelado");
    await tick();
    gated.release();
    for (let i = 0; i < 20; i++) await tick();
    expect(getJobStatus(userA.id, id)).toMatchObject({ state: "cancelado", feitas: 0 });
    expect(errorSpy).not.toHaveBeenCalled(); // cancelar não é falha
    // O slot ficou livre: outra tarefa roda.
    const next = await createOk(userA, studyId, 1, 4);
    expect((await waitDone(userA.id, next)).state).toBe("pronto");
  });

  it("cancelar na fila tira da fila sem nunca começar", async () => {
    const gatedA = gatedEngine();
    const engineB = gatedEngine();
    vi.mocked(getEngine).mockResolvedValueOnce(gatedA.engine).mockResolvedValueOnce(engineB.engine);
    const studyA = await makeStudy(userA, TEXTS);
    const studyB = await makeStudy(userB, ["Texto de B.", "Mais de B."]);
    const idA = await createOk(userA, studyA, 1, 4);
    const idB = await createOk(userB, studyB, 1, 2);
    expect(cancelJob(userB.id, idB)).toBe(true);
    expect(getJobStatus(userB.id, idB)?.state).toBe("cancelado");
    gatedA.release();
    engineB.release();
    await waitDone(userA.id, idA);
    for (let i = 0; i < 20; i++) await tick();
    expect(engineB.started()).toBe(0);
    expect(getJobStatus(userB.id, idB)?.state).toBe("cancelado");
    // B pode criar outra (a cancelada não conta como ativa).
    expect((await create(userB, studyB, 1, 2)).ok).toBe(true);
  });

  it("a tarefa só é visível ao dono", async () => {
    const studyId = await makeStudy(userA, TEXTS);
    const id = await createOk(userA, studyId, 1, 4);
    await waitDone(userA.id, id);
    expect(getJobStatus(userB.id, id)).toBeNull();
    expect(getCellMp3(userB.id, id, 1)).toBeNull();
    expect(getFullMp3(userB.id, id)).toBeNull();
    expect(cancelJob(userB.id, id)).toBe(false);
    expect(getJobStatus(userA.id, "nao-existe")).toBeNull();
  });
});

// Só os timers do módulo de tarefas: setImmediate (motor falso), workers e o banco continuam reais.
const fake = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });

describe("relógio: inatividade, tempo máximo e retenção", () => {

  it("sem consulta de status por 60 s a tarefa é cancelada", async () => {
    const gated = gatedEngine();
    vi.mocked(getEngine).mockResolvedValueOnce(gated.engine);
    const studyId = await makeStudy(userA, TEXTS);
    fake();
    const id = await createOk(userA, studyId, 1, 4);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(getJobStatus(userA.id, id)?.state).toBe("gerando"); // consultou: renova
    await vi.advanceTimersByTimeAsync(59_000);
    expect(getJobStatus(userA.id, id)?.state).toBe("gerando");
    await vi.advanceTimersByTimeAsync(60_001);
    expect(getJobStatus(userA.id, id)?.state).toBe("cancelado");
    for (let i = 0; i < 10; i++) await tick();
    expect(errorSpy).not.toHaveBeenCalled(); // inatividade não é falha
  });

  it("tarefa na fila também expira por inatividade", async () => {
    const gatedA = gatedEngine();
    vi.mocked(getEngine).mockResolvedValueOnce(gatedA.engine);
    const studyA = await makeStudy(userA, TEXTS);
    const studyB = await makeStudy(userB, ["Texto de B.", "Mais de B."]);
    fake();
    const idA = await createOk(userA, studyA, 1, 4);
    const idB = await createOk(userB, studyB, 1, 2);
    for (let i = 0; i < 2; i++) {
      await vi.advanceTimersByTimeAsync(40_000);
      getJobStatus(userA.id, idA);
    }
    expect(getJobStatus(userB.id, idB)?.state).toBe("cancelado");
    expect(getJobStatus(userA.id, idA)?.state).toBe("gerando");
  });

  it("tempo máximo de 20 min: erro \"A geração demorou demais.\" e o motor recebe o abort", async () => {
    let aborted = false;
    const hanging: SpeechEngine = {
      synthesize: (_items, _settings, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new VoiceCancelledError());
          });
        }),
    };
    vi.mocked(getEngine).mockResolvedValueOnce(hanging);
    const studyId = await makeStudy(userA, TEXTS);
    fake();
    const id = await createOk(userA, studyId, 1, 4);
    for (let elapsed = 0; elapsed < 19 * 60_000; elapsed += 50_000) {
      await vi.advanceTimersByTimeAsync(50_000);
      expect(getJobStatus(userA.id, id)?.state).toBe("gerando");
    }
    await vi.advanceTimersByTimeAsync(60_000);
    for (let i = 0; i < 10; i++) await tick();
    expect(aborted).toBe(true);
    expect(getJobStatus(userA.id, id)).toMatchObject({ state: "erro", message: "A geração demorou demais." });
  });

  it("motor que ignora o abort não trava a fila depois do tempo máximo", async () => {
    process.env.STUDYFLOW_VOZ_JOB_TIMEOUT_MS = "30000";
    const deaf: SpeechEngine = { synthesize: () => new Promise(() => {}) };
    vi.mocked(getEngine).mockResolvedValueOnce(deaf);
    const studyA = await makeStudy(userA, TEXTS);
    const studyB = await makeStudy(userB, ["Texto de B.", "Mais de B."]);
    fake();
    const idA = await createOk(userA, studyA, 1, 4);
    const idB = await createOk(userB, studyB, 1, 2);
    await vi.advanceTimersByTimeAsync(30_001);
    for (let i = 0; i < 10; i++) await tick();
    expect(getJobStatus(userA.id, idA)).toMatchObject({ state: "erro", message: "A geração demorou demais." });
    expect((await waitDone(userB.id, idB)).state).toBe("pronto");
  });

  it("tarefa terminada some depois de 1 hora", async () => {
    const studyId = await makeStudy(userA, TEXTS);
    fake();
    const id = await createOk(userA, studyId, 1, 4);
    expect((await waitDone(userA.id, id)).state).toBe("pronto");
    await vi.advanceTimersByTimeAsync(59 * 60_000);
    expect(getJobStatus(userA.id, id)?.state).toBe("pronto"); // consultar não estende a retenção
    await vi.advanceTimersByTimeAsync(60_001);
    expect(getJobStatus(userA.id, id)).toBeNull();
    expect(getCellMp3(userA.id, id, 1)).toBeNull();
  });

  it("_resetJobsForTests aborta o que está rodando e limpa tudo", async () => {
    let aborted = false;
    const hanging: SpeechEngine = {
      synthesize: (_items, _settings, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new VoiceCancelledError());
          });
        }),
    };
    vi.mocked(getEngine).mockResolvedValueOnce(hanging);
    const studyId = await makeStudy(userA, TEXTS);
    const id = await createOk(userA, studyId, 1, 4);
    _resetJobsForTests();
    expect(aborted).toBe(true);
    expect(getJobStatus(userA.id, id)).toBeNull();
    // Nada ficou preso: uma tarefa nova roda.
    const next = await createOk(userA, studyId, 1, 4);
    expect((await waitDone(userA.id, next)).state).toBe("pronto");
  });
});

describe("synthesizeSample", () => {
  const settings = { voice: VOICE, speed: 1.2, volume: 0.8 };

  it("gera o MP3 da frase fixa pelo motor e reaproveita o cache", async () => {
    const mp3 = await synthesizeSample(userA.id, settings);
    expect(Buffer.isBuffer(mp3)).toBe(true);
    expect(mp3.length).toBeGreaterThan(0);
    expect(calls).toEqual([[{ n: 1, text: "Esta é uma amostra da voz escolhida." }]]);
    const again = await synthesizeSample(userA.id, settings);
    expect(again.equals(mp3)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("falha do motor na amostra: VoiceError para a rota e registro no servidor", async () => {
    const failing = gatedEngine(new Error("piper caiu"));
    vi.mocked(getEngine).mockResolvedValueOnce(failing.engine);
    failing.release();
    const error = await synthesizeSample(userA.id, settings).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VoiceError);
    expect((error as Error).message).toBe("A geração de voz falhou.");
    expect(errorSpy).toHaveBeenCalledWith("Falha na geração da amostra de voz:", expect.objectContaining({ message: "piper caiu" }));
  });

  it("sem motor: 503; motor real com voz não instalada: 503", async () => {
    vi.mocked(getEngine).mockResolvedValueOnce(null);
    await expect(synthesizeSample(userA.id, settings)).rejects.toMatchObject({ status: 503, message: NOT_INSTALLED_ENV });
    delete process.env.STUDYFLOW_VOZ_ENGINE;
    await expect(synthesizeSample(userA.id, settings)).rejects.toMatchObject({ status: 503, message: VOICE_MISSING });
  });

  it("espera o slot da fila e não conta como tarefa do usuário", async () => {
    const gated = gatedEngine();
    vi.mocked(getEngine).mockResolvedValueOnce(gated.engine);
    const studyId = await makeStudy(userA, TEXTS);
    const id = await createOk(userA, studyId, 1, 4);
    let done = false;
    const sample = synthesizeSample(userB.id, settings).then((mp3) => {
      done = true;
      return mp3;
    });
    for (let i = 0; i < 20; i++) await tick();
    expect(done).toBe(false); // a tarefa de A ocupa o slot
    gated.release();
    expect((await sample).length).toBeGreaterThan(0);
    await waitDone(userA.id, id);
    // O próprio A pode pedir amostra com a tarefa dele ativa, e criar tarefa enquanto a amostra espera.
    const gated2 = gatedEngine();
    vi.mocked(getEngine).mockResolvedValueOnce(gated2.engine);
    const id2 = await createOk(userA, studyId, 1, 3);
    const sampleA = synthesizeSample(userA.id, { ...settings, speed: 0.7 });
    gated2.release();
    expect((await sampleA).length).toBeGreaterThan(0);
    expect((await waitDone(userA.id, id2)).state).toBe("pronto");
  });

  it("amostra presa na fila desiste depois do tempo limite", async () => {
    const gated = gatedEngine();
    vi.mocked(getEngine).mockResolvedValueOnce(gated.engine);
    const studyId = await makeStudy(userA, TEXTS);
    fake();
    const id = await createOk(userA, studyId, 1, 4);
    const sample = synthesizeSample(userB.id, settings);
    const outcome = sample.then(
      () => null,
      (error: unknown) => error,
    );
    await realWait(200); // a amostra chega à fila (lê o cache em disco)
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(30_000);
      getJobStatus(userA.id, id);
    }
    expect(await outcome).toMatchObject({ status: 503, message: "A voz está ocupada agora. Tente de novo em instantes." });
    gated.release();
  });
});
