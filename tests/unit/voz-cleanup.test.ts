// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => import("./helpers/next-headers"));
// O motor vem do falso real por padrão; o teste da tarefa ativa troca por um motor que só termina quando solto.
vi.mock("@/features/voz/engine/index", () => ({ getEngine: vi.fn() }));

import { clearAudios } from "@/features/voz/actions";
import { cacheDir, clearAudioCache } from "@/features/voz/cache";
import { getEngine } from "@/features/voz/engine/index";
import { FakeEngine } from "@/features/voz/engine/fake";
import { VoiceCancelledError, type SpeechEngine } from "@/features/voz/engine/types";
import { _resetJobsForTests, createJob, discardAllJobs, getJobStatus } from "@/features/voz/jobs";
import { FORBIDDEN_MESSAGE, SESSION_EXPIRED_MESSAGE } from "@/lib/auth-response";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

vi.setConfig({ testTimeout: 30_000 });

const HEX = "a".repeat(64);
const HEX2 = "b".repeat(64);

let root: string;
let savedDir: string | undefined;
let savedEngine: string | undefined;

beforeEach(async () => {
  savedDir = process.env.STUDYFLOW_VOZ_DIR;
  savedEngine = process.env.STUDYFLOW_VOZ_ENGINE;
  root = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-voz-cleanup-"));
  process.env.STUDYFLOW_VOZ_DIR = root;
  process.env.STUDYFLOW_VOZ_ENGINE = "fake";
  vi.mocked(getEngine).mockReset();
  vi.mocked(getEngine).mockImplementation(async () => new FakeEngine());
  _resetJobsForTests();
  signOut();
});

afterEach(async () => {
  _resetJobsForTests();
  if (savedDir === undefined) delete process.env.STUDYFLOW_VOZ_DIR;
  else process.env.STUDYFLOW_VOZ_DIR = savedDir;
  if (savedEngine === undefined) delete process.env.STUDYFLOW_VOZ_ENGINE;
  else process.env.STUDYFLOW_VOZ_ENGINE = savedEngine;
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
});

async function seedCache() {
  const dir = cacheDir();
  await fs.mkdir(path.join(dir, "subpasta"), { recursive: true });
  await fs.writeFile(path.join(dir, `${HEX}.mp3`), Buffer.alloc(1000));
  await fs.writeFile(path.join(dir, `${HEX2}.mp3`), Buffer.alloc(500));
  await fs.writeFile(path.join(dir, `${HEX}.mp3.abc123.tmp`), Buffer.alloc(100));
  // Nada disto tem nome de cache: não pode ser apagado.
  await fs.writeFile(path.join(dir, "leiame.txt"), "meu");
  await fs.writeFile(path.join(dir, "ABC.mp3"), "meu");
  await fs.writeFile(path.join(dir, "subpasta", `${HEX}.mp3`), "dentro de subpasta");
}

describe("clearAudioCache", () => {
  it("apaga só arquivos com nome de cache (final e temporário) e conta arquivos e bytes", async () => {
    await seedCache();
    expect(await clearAudioCache()).toEqual({ files: 3, bytes: 1600 });
    const left = (await fs.readdir(cacheDir())).sort();
    expect(left).toEqual(["ABC.mp3", "leiame.txt", "subpasta"]);
    expect(await fs.readFile(path.join(cacheDir(), "subpasta", `${HEX}.mp3`), "utf8")).toBe("dentro de subpasta");
  });

  it("pasta de cache inexistente: nada a apagar, sem erro", async () => {
    expect(await clearAudioCache()).toEqual({ files: 0, bytes: 0 });
  });

  it("não toca no resto da pasta de voz (venv, vozes)", async () => {
    await seedCache();
    await fs.mkdir(path.join(root, "voices"), { recursive: true });
    await fs.writeFile(path.join(root, "voices", "pt_BR-faber-medium.onnx"), "modelo");
    await clearAudioCache();
    expect(await fs.readFile(path.join(root, "voices", "pt_BR-faber-medium.onnx"), "utf8")).toBe("modelo");
  });
});

describe("clearAudios (ação)", () => {
  it("recusa sem sessão e não apaga nada", async () => {
    await seedCache();
    expect(await clearAudios()).toEqual({ ok: false, message: SESSION_EXPIRED_MESSAGE });
    expect((await fs.readdir(cacheDir())).length).toBe(6);
  });

  it("recusa usuário comum e não apaga nada", async () => {
    const user = await createTestUser({ role: "USER" });
    await signInAs(user);
    await seedCache();
    expect(await clearAudios()).toEqual({ ok: false, message: FORBIDDEN_MESSAGE });
    expect((await fs.readdir(cacheDir())).length).toBe(6);
  });

  it("superusuário apaga o cache e recebe a contagem", async () => {
    const user = await createTestUser({ role: "SUPER" });
    await signInAs(user);
    await seedCache();
    expect(await clearAudios()).toEqual({ ok: true, data: { files: 3, bytes: 1600 } });
  });
});

describe("discardAllJobs", () => {
  async function makeStudy(userId: string) {
    const cells = ["Primeira célula.", "Segunda célula."].map((texto, i) => ({ id: `c${i + 1}`, texto }));
    const study = await db.studyRecord.create({
      data: {
        userId,
        descricao: "Estudo",
        pasta: path.join(root, "pasta"),
        dataInicial: "2026-10-31",
        conteudo: JSON.stringify(cells),
      },
    });
    return study.id;
  }

  it("descarta tarefa pronta (o áudio some da memória) e devolve quantas eram", async () => {
    const user = await createTestUser();
    await signInAs(user);
    const studyId = await makeStudy(user.id);
    const created = await createJob(user.id, { studyId, start: 1, end: 2, mode: "gravar" });
    if (!created.ok) throw new Error(created.message);
    const until = Date.now() + 15_000;
    while (getJobStatus(user.id, created.id)?.state !== "pronto") {
      if (Date.now() > until) throw new Error("a tarefa não terminou");
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(discardAllJobs()).toBe(1);
    expect(getJobStatus(user.id, created.id)).toBeNull();
    expect(discardAllJobs()).toBe(0);
  });

  it("cancela a tarefa ativa (o motor recebe o abort) e libera o usuário para criar outra", async () => {
    const user = await createTestUser();
    await signInAs(user);
    const studyId = await makeStudy(user.id);
    let aborted = false;
    const stuck: SpeechEngine = {
      synthesize: (_items, _settings, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new VoiceCancelledError());
            },
            { once: true },
          );
        }),
    };
    vi.mocked(getEngine).mockImplementation(async () => stuck);
    const created = await createJob(user.id, { studyId, start: 1, end: 2, mode: "gravar" });
    if (!created.ok) throw new Error(created.message);
    const until = Date.now() + 5_000;
    while (getJobStatus(user.id, created.id)?.state !== "gerando") {
      if (Date.now() > until) throw new Error("a tarefa não começou");
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(discardAllJobs()).toBe(1);
    expect(aborted).toBe(true);
    expect(getJobStatus(user.id, created.id)).toBeNull();

    vi.mocked(getEngine).mockImplementation(async () => new FakeEngine());
    expect((await createJob(user.id, { studyId, start: 1, end: 2, mode: "gravar" })).ok).toBe(true);
  });
});
