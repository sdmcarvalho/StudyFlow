// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => import("./helpers/next-headers"));

import { POST as postSample } from "@/app/api/voz/amostra/route";
import { GET as getCell } from "@/app/api/voz/jobs/[id]/cells/[n]/route";
import { GET as getDownload } from "@/app/api/voz/jobs/[id]/download/route";
import { DELETE as deleteJob, GET as getStatus } from "@/app/api/voz/jobs/[id]/route";
import { POST as postJob } from "@/app/api/voz/jobs/route";
import { _resetJobsForTests, getCellMp3, type JobStatus } from "@/features/voz/jobs";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

vi.setConfig({ testTimeout: 30_000 });

const HOST = "localhost:3000";
const VOICE = "pt_BR-faber-medium";
const ENV_KEYS = ["STUDYFLOW_VOZ_ENGINE", "STUDYFLOW_VOZ_DIR", "STUDYFLOW_VOZ_MAX_CHARS", "STUDYFLOW_VOZ_PYTHON"];

type Person = Awaited<ReturnType<typeof createTestUser>>;
type Options = { origin?: string; contentType?: string | null; method?: string };

function req(urlPath: string, body?: unknown, options: Options = {}) {
  const headers = new Headers({ host: HOST });
  const contentType = options.contentType === undefined ? "application/json" : options.contentType;
  if (body !== undefined && contentType !== null) headers.set("content-type", contentType);
  if (options.origin) headers.set("origin", options.origin);
  return new Request(`http://${HOST}${urlPath}`, {
    method: options.method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const jobCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const cellCtx = (id: string, n: string) => ({ params: Promise.resolve({ id, n }) });

const create = (body: unknown, options?: Options) => postJob(req("/api/voz/jobs", body, options));
const status = (id: string) => getStatus(req(`/api/voz/jobs/${id}`), jobCtx(id));
const cancel = (id: string, options: Options = {}) =>
  deleteJob(req(`/api/voz/jobs/${id}`, undefined, { method: "DELETE", ...options }), jobCtx(id));
const cell = (id: string, n: string) => getCell(req(`/api/voz/jobs/${id}/cells/${n}`), cellCtx(id, n));
const download = (id: string) => getDownload(req(`/api/voz/jobs/${id}/download`), jobCtx(id));
const sample = (body: unknown, options?: Options) => postSample(req("/api/voz/amostra", body, options));

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

let savedEnv: Record<string, string | undefined>;
let vozRoot: string;
let userA: Person;
let userB: Person;
let studyA: string;

async function makeStudy(user: Person, texts: string[], descricao = "Estudo de voz") {
  const cells = texts.map((texto, i) => ({ id: `c${i + 1}`, texto }));
  const study = await db.studyRecord.create({
    data: {
      userId: user.id,
      descricao,
      pasta: path.join(vozRoot, "pasta"),
      dataInicial: "2026-10-31",
      conteudo: JSON.stringify(cells),
    },
  });
  return study.id;
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function waitDone(id: string): Promise<JobStatus> {
  const until = performance.now() + 15_000;
  while (performance.now() < until) {
    const response = await status(id);
    const body = (await response.json()) as JobStatus;
    if (["pronto", "erro", "cancelado"].includes(body.state)) return body;
    await tick();
  }
  throw new Error("a tarefa não terminou");
}

async function createdId(body: unknown): Promise<string> {
  const response = await create(body);
  expect(response.status).toBe(200);
  const json = (await response.json()) as { id: string };
  return json.id;
}

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  vozRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-voz-routes-"));
  process.env.STUDYFLOW_VOZ_DIR = vozRoot;
  process.env.STUDYFLOW_VOZ_ENGINE = "fake";
  _resetJobsForTests();
  await clearUsers();
  signOut();
  userA = await createTestUser({ name: "Ana" });
  userB = await createTestUser({ name: "Beto" });
  studyA = await makeStudy(userA, ["Primeira célula.", "![só imagem](a.png)", "Terceira."], "Física: ondas çã");
  await signInAs(userA);
});

afterEach(async () => {
  _resetJobsForTests();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await fs.rm(vozRoot, { recursive: true, force: true, maxRetries: 5 });
});

describe("sessão, origem e corpo", () => {
  it("sem sessão: 401 em todas as rotas", async () => {
    signOut();
    const unauthorized = async (response: Response) => {
      expect(response.status).toBe(401);
      expect(((await response.json()) as { message: string }).message).toBeTruthy();
    };
    await unauthorized(await create({ studyId: studyA, start: 1, end: 3, mode: "ler" }));
    await unauthorized(await status("x"));
    await unauthorized(await cancel("x"));
    await unauthorized(await cell("x", "1"));
    await unauthorized(await download("x"));
    await unauthorized(await sample({ voice: VOICE, speed: 1, volume: 1 }));
  });

  it("origem diferente: 403 nos POST e no DELETE", async () => {
    const evil = { origin: "https://site-malicioso.example" };
    const forbidden = { message: "Origem não permitida." };
    const r1 = await create({ studyId: studyA, start: 1, end: 3, mode: "ler" }, evil);
    expect(r1.status).toBe(403);
    expect(await r1.json()).toEqual(forbidden);
    const r2 = await cancel("x", evil);
    expect(r2.status).toBe(403);
    expect(await r2.json()).toEqual(forbidden);
    const r3 = await sample({ voice: VOICE, speed: 1, volume: 1 }, evil);
    expect(r3.status).toBe(403);
    expect(await r3.json()).toEqual(forbidden);
  });

  it("sem content-type JSON: 415; JSON inválido: 400", async () => {
    const r1 = await create("{}", { contentType: "text/plain" });
    expect(r1.status).toBe(415);
    expect(await r1.json()).toEqual({ message: "Envie os dados em JSON." });
    const r2 = await sample("{}", { contentType: null });
    expect(r2.status).toBe(415);
    const r3 = await create("{nao e json");
    expect(r3.status).toBe(400);
    const r4 = await sample("{nao e json");
    expect(r4.status).toBe(400);
    const r5 = await create([1, 2]);
    expect(r5.status).toBe(400);
  });
});

describe("POST /api/voz/jobs", () => {
  it("cria e devolve { id }; intervalo inválido dá 400 com a mensagem do range", async () => {
    const response = await create({ studyId: studyA, start: 1, end: 3, mode: "gravar" });
    expect(response.status).toBe(200);
    expect(Object.keys((await response.json()) as object)).toEqual(["id"]);

    _resetJobsForTests();
    const bad = await create({ studyId: studyA, start: "abc", end: 3, mode: "gravar" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ message: "Use um número inteiro." });
  });

  it("Estudo de outro usuário: 404; segunda tarefa: 409; sem motor: 503", async () => {
    await signInAs(userB);
    const notMine = await create({ studyId: studyA, start: 1, end: 3, mode: "gravar" });
    expect(notMine.status).toBe(404);
    expect(await notMine.json()).toEqual({ message: "Estudo não encontrado." });

    await signInAs(userA);
    await createdId({ studyId: studyA, start: 1, end: 3, mode: "gravar" });
    const busy = await create({ studyId: studyA, start: 1, end: 3, mode: "ler" });
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({ message: "Você já tem uma voz em andamento." });

    _resetJobsForTests();
    delete process.env.STUDYFLOW_VOZ_ENGINE; // e sem STUDYFLOW_VOZ_PYTHON: nenhum motor
    const none = await create({ studyId: studyA, start: 1, end: 3, mode: "gravar" });
    expect(none.status).toBe(503);
    expect(await none.json()).toEqual({ message: "A voz não está instalada neste ambiente." });
  });
});

describe("tarefa: status, células, download e cancelamento", () => {
  it("status JSON, células e download com Content-Disposition UTF-8", async () => {
    const id = await createdId({ studyId: studyA, start: 1, end: 3, mode: "gravar" });
    const done = await waitDone(id);
    expect(done).toEqual({ id, mode: "gravar", state: "pronto", total: 2, feitas: 2, readyCells: [1, 3] });

    const c1 = await cell(id, "1");
    expect(c1.status).toBe(200);
    expect(c1.headers.get("content-type")).toBe("audio/mpeg");
    expect(c1.headers.get("cache-control")).toBe("no-store");
    const bytes = Buffer.from(await c1.arrayBuffer());
    expect(bytes.equals(getCellMp3(userA.id, id, 1)!)).toBe(true);

    for (const n of ["abc", "9999", "0", "-1", "1.5", "2", "01"]) {
      expect((await cell(id, n)).status, n).toBe(404);
    }

    const file = await download(id);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("audio/mpeg");
    expect(file.headers.get("cache-control")).toBe("no-store");
    const name = "Física- ondas çã - células 1 a 3.mp3";
    expect(file.headers.get("content-disposition")).toBe(
      `attachment; filename="Fisica- ondas ca - celulas 1 a 3.mp3"; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    const full = Buffer.from(await file.arrayBuffer());
    expect(full.equals(Buffer.concat([getCellMp3(userA.id, id, 1)!, getCellMp3(userA.id, id, 3)!]))).toBe(true);
  });

  it("download antes de pronto: 409; no modo ler: 404", async () => {
    // Trecho grande o bastante para o download ser pedido antes do fim.
    const big = await makeStudy(userA, Array.from({ length: 30 }, (_, i) => `Célula número ${i + 1}.`));
    const id = await createdId({ studyId: big, start: 1, end: 30, mode: "gravar" });
    const early = await download(id);
    expect(early.status).toBe(409);
    expect(await early.json()).toEqual({ message: "O áudio ainda não está pronto." });
    await cancel(id);

    const ler = await createdId({ studyId: studyA, start: 1, end: 3, mode: "ler" });
    await waitDone(ler);
    expect((await download(ler)).status).toBe(404);
  });

  it("DELETE cancela e devolve { ok: true }; id desconhecido: 404", async () => {
    const big = await makeStudy(userA, Array.from({ length: 30 }, (_, i) => `Célula número ${i + 1}.`));
    const id = await createdId({ studyId: big, start: 1, end: 30, mode: "ler" });
    const response = await cancel(id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(((await (await status(id)).json()) as JobStatus).state).toBe("cancelado");
    const unknown = await cancel("nao-existe");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ message: "Tarefa não encontrada." });
  });

  it("usuário B recebe 404 em status, célula, download e cancelar da tarefa de A", async () => {
    const id = await createdId({ studyId: studyA, start: 1, end: 3, mode: "gravar" });
    await waitDone(id);
    await signInAs(userB);
    for (const response of [await status(id), await cell(id, "1"), await download(id), await cancel(id)]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ message: "Tarefa não encontrada." });
    }
    await signInAs(userA);
    expect(((await (await status(id)).json()) as JobStatus).state).toBe("pronto");
  });
});

describe("POST /api/voz/amostra", () => {
  it("valida voz, velocidade e volume (400)", async () => {
    for (const body of [
      { voice: "", speed: 1, volume: 1 },
      { voice: VOICE, speed: 3, volume: 1 },
      { voice: VOICE, speed: 1, volume: 1.5 },
      { voice: VOICE, speed: "1", volume: 1 },
      null,
    ]) {
      const response = await sample(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(((await response.json()) as { message: string }).message).toBeTruthy();
    }
  });

  it("devolve audio/mpeg com o motor falso", async () => {
    const response = await sample({ voice: VOICE, speed: 1, volume: 1 });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("motor real: voz fora do catálogo dá 503; sem motor dá 503", async () => {
    delete process.env.STUDYFLOW_VOZ_ENGINE;
    // "Piper" de mentira: o arquivo existe e há uma voz instalada, mas não a pedida.
    const python = path.join(vozRoot, "python.exe");
    await fs.writeFile(python, "");
    await fs.mkdir(path.join(vozRoot, "voices"));
    await fs.writeFile(path.join(vozRoot, "voices", "pt_BR-cadu-medium.onnx"), "x");
    await fs.writeFile(path.join(vozRoot, "voices", "pt_BR-cadu-medium.onnx.json"), "{}");
    process.env.STUDYFLOW_VOZ_PYTHON = python;
    const missing = await sample({ voice: "../../x", speed: 1, volume: 1 });
    expect(missing.status).toBe(503);
    expect(await missing.json()).toEqual({
      message: "A voz escolhida não está instalada. Escolha outra em Configuração.",
    });

    delete process.env.STUDYFLOW_VOZ_PYTHON;
    const none = await sample({ voice: VOICE, speed: 1, volume: 1 });
    expect(none.status).toBe(503);
    expect(await none.json()).toEqual({ message: "A voz não está instalada neste ambiente." });
  });
});
