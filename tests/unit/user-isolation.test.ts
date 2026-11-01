// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => import("./helpers/next-headers"));

import { GET as getImage } from "@/app/(app)/estudo/[id]/imagens/[arquivo]/route";
import { POST as postImage } from "@/app/(app)/estudo/[id]/imagens/route";
import { POST as modelos } from "@/app/api/ai/modelos/route";
import { GET as getCards } from "@/app/api/cards/route";
import { GET as getSummary } from "@/app/api/testes/resumo/route";
import { GET as getVozCell } from "@/app/api/voz/jobs/[id]/cells/[n]/route";
import { GET as downloadVozJob } from "@/app/api/voz/jobs/[id]/download/route";
import { DELETE as deleteVozJob, GET as getVozJob } from "@/app/api/voz/jobs/[id]/route";
import { POST as postVozJob } from "@/app/api/voz/jobs/route";
import {
  checkStudyHasActiveSchedules,
  completeSchedule,
  deleteSchedule,
  createSchedules,
  listUserSchedules,
} from "@/features/agenda/actions";
import { saveAiSettings } from "@/features/ai/actions";
import { getAiSettings } from "@/features/ai/queries";
import {
  createCard,
  deleteCard,
  getCardAccuracy,
  recordCardResult,
  restoreCard,
  updateCard,
  updateLastTested,
} from "@/features/cards/actions";
import { listStudyCards, listStudyTestSummaries } from "@/features/cards/queries";
import {
  deleteStudyRecord,
  restoreStudyRecord,
  saveStudyContent,
  updateStudyRecord,
} from "@/features/estudo/actions";
import { userRoot } from "@/features/estudo/folder-scope";
import { getStudyDocument, getStudyFolder, listStudyRecords } from "@/features/estudo/queries";
import { saveVoiceSettings } from "@/features/voz/actions";
import { _resetJobsForTests, cancelJob, createJob, getCellMp3, getFullMp3, getJobStatus } from "@/features/voz/jobs";
import { getVoiceSettings } from "@/features/voz/queries";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

const STUDY_NOT_FOUND = { ok: false, message: "Registro não encontrado." };
const CARD_NOT_FOUND = { ok: false, message: "Card ou Estudo não encontrado." };
const A_KEY = "sk-chave-secreta-de-A-1234567890";

// PNG real de 1x1 pixel.
const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

let base: string;
let vozFolder: string;

async function clearDatabase() {
  await db.cardResult.deleteMany();
  await db.schedule.deleteMany();
  await db.card.deleteMany();
  await db.studyRecord.deleteMany();
  await db.aiSettings.deleteMany();
  await db.voiceSettings.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
}

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-isolation-"));
  vi.stubEnv("STUDYFLOW_BASE_DIR", base);
  // Catálogo de vozes de mentira: salvar a voz exige que ela esteja instalada.
  vozFolder = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-isolation-voz-"));
  await fs.mkdir(path.join(vozFolder, "voices"));
  await fs.writeFile(path.join(vozFolder, "voices", "pt_BR-faber-medium.onnx"), "x");
  await fs.writeFile(path.join(vozFolder, "voices", "pt_BR-faber-medium.onnx.json"), "{}");
  vi.stubEnv("STUDYFLOW_VOZ_DIR", vozFolder);
});

afterAll(async () => {
  // Cards e agendamentos não podem sobrar: outros arquivos limpam só parte das tabelas.
  await clearDatabase();
  vi.unstubAllEnvs();
  await fs.rm(base, { recursive: true, force: true });
  await fs.rm(vozFolder, { recursive: true, force: true });
});

type Person = Awaited<ReturnType<typeof createTestUser>>;
let userA: Person;
let userB: Person;
let ids: { study: string; trashedStudy: string; card: string; trashedCard: string; schedule: string };
let folderA: string;

/** Fotografia de tudo que o usuário tem no banco: serve para provar que nada mudou, byte a byte. */
async function snapshot(userId: string) {
  const where = { userId };
  const orderBy = { id: "asc" } as const;
  return JSON.parse(
    JSON.stringify({
      studies: await db.studyRecord.findMany({ where, orderBy }),
      cards: await db.card.findMany({ where, orderBy }),
      results: await db.cardResult.findMany({ where, orderBy }),
      schedules: await db.schedule.findMany({ where, orderBy }),
      ai: await db.aiSettings.findMany({ where, orderBy }),
      voice: await db.voiceSettings.findMany({ where, orderBy }),
    }),
  );
}

let before: Awaited<ReturnType<typeof snapshot>>;

beforeEach(async () => {
  await clearDatabase();
  signOut();

  userA = await createTestUser({ name: "Ana" });
  userB = await createTestUser({ name: "Beto" });
  folderA = path.join(userRoot(userA), "Calculo");
  await fs.mkdir(path.join(folderA, "imagens"), { recursive: true });
  await fs.writeFile(path.join(folderA, "imagens", "foto.png"), PNG_BYTES);

  const cells = JSON.stringify([{ id: "c1", texto: "Conteúdo secreto de A" }]);
  const study = await db.studyRecord.create({
    data: { userId: userA.id, descricao: "Estudo de A", pasta: folderA, dataInicial: "2026-08-04", conteudo: cells },
  });
  const trashedStudy = await db.studyRecord.create({
    data: {
      userId: userA.id,
      descricao: "Lixeira de A",
      pasta: path.join(userRoot(userA), "Lixeira"),
      dataInicial: "2026-08-04",
      conteudo: cells,
      deletedAt: new Date(),
    },
  });
  const card = await db.card.create({
    data: { userId: userA.id, studyId: study.id, cellId: "c1", tema: "Tema A", pergunta: "P de A", resposta: "R de A" },
  });
  const trashedCard = await db.card.create({
    data: {
      userId: userA.id,
      studyId: study.id,
      cellId: "c1",
      tema: "Tema velho",
      pergunta: "P velha",
      resposta: "R velha",
      deletedAt: new Date(),
    },
  });
  await db.cardResult.create({ data: { userId: userA.id, studyId: study.id, cardId: card.id, correct: true } });
  const schedule = await db.schedule.create({
    data: {
      userId: userA.id,
      studyId: study.id,
      reviewDate: "2026-09-01",
      createdAt: "2026-08-04",
      session: "Imediata",
      status: "Ativo",
    },
  });
  await db.aiSettings.create({
    data: { userId: userA.id, baseUrl: "https://gateway-de-a/v1", apiKey: A_KEY, model: "modelo-a" },
  });
  await db.voiceSettings.create({ data: { userId: userA.id, voice: "pt_BR-faber-medium", speed: 1.5, volume: 0.5 } });
  ids = {
    study: study.id,
    trashedStudy: trashedStudy.id,
    card: card.id,
    trashedCard: trashedCard.id,
    schedule: schedule.id,
  };
  before = await snapshot(userA.id);
  await signInAs(userB);
});

async function expectAUntouched() {
  expect(await snapshot(userA.id)).toEqual(before);
}

describe("um usuário não enxerga nem altera os dados de outro", () => {
  it("Estudos: listagem e leituras não mostram nada de A", async () => {
    expect((await listStudyRecords({})).items).toEqual([]);
    expect(await getStudyDocument(ids.study)).toBeNull();
    expect(await getStudyFolder(ids.study)).toBeNull();
    expect(await listStudyCards(ids.study)).toEqual([]);
  });

  it("Estudos: updateStudyRecord, saveStudyContent, deleteStudyRecord e restoreStudyRecord com ids de A falham", async () => {
    const input = { descricao: "Invadido", pasta: path.join(userRoot(userB), "X"), dataInicial: "2026-01-01" };
    expect(await updateStudyRecord(ids.study, input)).toEqual(STUDY_NOT_FOUND);
    expect(await saveStudyContent(ids.study, [{ id: "c1", texto: "sobrescrito" }])).toEqual(STUDY_NOT_FOUND);
    expect(await deleteStudyRecord(ids.study)).toEqual(STUDY_NOT_FOUND);
    expect(await restoreStudyRecord(ids.trashedStudy)).toEqual(STUDY_NOT_FOUND);
    await expectAUntouched();
    // Nem pasta criada no disco para a tentativa de B.
    await expect(fs.stat(input.pasta)).rejects.toThrow();
  });

  it("Cards: createCard, updateCard, deleteCard e restoreCard em dados de A falham", async () => {
    const input = { tema: "Invasor", pergunta: "P", resposta: "R" };
    expect(await createCard(ids.study, "c1", input)).toEqual(CARD_NOT_FOUND);
    expect(await updateCard(ids.card, input)).toEqual(CARD_NOT_FOUND);
    expect(await deleteCard(ids.card)).toEqual(CARD_NOT_FOUND);
    expect(await restoreCard(ids.trashedCard)).toEqual(CARD_NOT_FOUND);
    await expectAUntouched();
    expect(await db.card.count({ where: { userId: userB.id } })).toBe(0);
  });

  it("Testes: listStudyTestSummaries, recordCardResult, getCardAccuracy e updateLastTested em dados de A falham", async () => {
    expect(await listStudyTestSummaries()).toEqual([]);
    expect(await recordCardResult(ids.card, ids.study, true)).toEqual(CARD_NOT_FOUND);
    expect(await getCardAccuracy(ids.card)).toEqual(CARD_NOT_FOUND);
    expect(await updateLastTested(ids.study)).toEqual(CARD_NOT_FOUND);
    await expectAUntouched();
    expect(await db.cardResult.count({ where: { userId: userB.id } })).toBe(0);
  });

  it("GET /api/cards?studyId=<A> devolve lista vazia", async () => {
    const response = await getCards(new NextRequest(`http://localhost/api/cards?studyId=${ids.study}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("GET /api/testes/resumo não traz os Estudos de A", async () => {
    // B tem um Estudo próprio com card: só esse aparece.
    const own = await db.studyRecord.create({
      data: { userId: userB.id, descricao: "Estudo de B", pasta: path.join(userRoot(userB), "B"), dataInicial: "2026-08-04" },
    });
    await db.card.create({
      data: { userId: userB.id, studyId: own.id, cellId: "x", tema: "t", pergunta: "p", resposta: "r" },
    });
    const response = await getSummary();
    expect(response.status).toBe(200);
    const summaries = (await response.json()) as { studyId: string; studyName: string; totalAttempts: number }[];
    expect(summaries.map((s) => s.studyId)).toEqual([own.id]);
    expect(summaries[0].totalAttempts).toBe(0);
  });

  it("Agenda: listUserSchedules, completeSchedule, createSchedules e checkStudyHasActiveSchedules", async () => {
    expect(await listUserSchedules()).toEqual([]);
    expect(await completeSchedule(ids.schedule)).toEqual({ ok: false, message: "Agendamento não encontrado." });
    expect(await deleteSchedule(ids.schedule)).toEqual({ ok: false, message: "Agendamento não encontrado." });
    expect(await db.schedule.count({ where: { id: ids.schedule } })).toBe(1);
    expect(await checkStudyHasActiveSchedules(ids.study)).toBe(false);

    const created = await createSchedules({ studyId: ids.study, studyName: "Estudo de A", force: true });
    expect(created.ok).toBe(false);
    // Nada foi criado, nem preso ao Estudo de A, nem na agenda de B (e a agenda de B não vaza o nome do Estudo).
    expect(await db.schedule.count({ where: { studyId: ids.study } })).toBe(1);
    expect(await db.schedule.count({ where: { userId: userB.id } })).toBe(0);
    expect(await listUserSchedules()).toEqual([]);
    await expectAUntouched();
  });

  it("Imagens: GET é 404 e POST não grava nada na pasta de A", async () => {
    const get = await getImage(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: ids.study, arquivo: "foto.png" }),
    });
    expect(get.status).toBe(404);

    const form = new FormData();
    form.append("file", new File([PNG_BYTES], "nova.png", { type: "image/png" }));
    const post = await postImage(new Request("http://localhost/x", { method: "POST", body: form }), {
      params: Promise.resolve({ id: ids.study }),
    });
    expect(post.status).toBe(404);
    expect(await fs.readdir(path.join(folderA, "imagens"))).toEqual(["foto.png"]);
  });

  it("IA: B começa sem configuração e salvar a dele não toca na linha de A", async () => {
    const mine = await getAiSettings();
    expect(mine).toMatchObject({ baseUrl: "", hasKey: false, apiKeyMasked: "", model: "" });

    const saved = await saveAiSettings({
      baseUrl: "https://gateway-de-b/v1",
      apiKey: "",
      model: "modelo-b",
      temperature: 0.5,
      timeout: 60,
      extraParams: "",
    });
    expect(saved.ok).toBe(true);
    expect(await db.aiSettings.count({ where: { userId: userB.id } })).toBe(1);
    await expectAUntouched();
  });

  it("Voz: B começa com os padrões e salvar a dele não toca na linha de A", async () => {
    expect(await getVoiceSettings()).toEqual({ voice: "pt_BR-faber-medium", speed: 1, volume: 1 });

    const saved = await saveVoiceSettings({ voice: "pt_BR-faber-medium", speed: 2, volume: 0.2 });
    expect(saved).toEqual({ ok: true, data: { voice: "pt_BR-faber-medium", speed: 2, volume: 0.2 } });
    expect(await db.voiceSettings.count({ where: { userId: userB.id } })).toBe(1);
    expect(await getVoiceSettings()).toEqual({ voice: "pt_BR-faber-medium", speed: 2, volume: 0.2 });
    await expectAUntouched();
  });

  it("Voz: B não cria tarefa no Estudo de A nem consulta, baixa ou cancela a tarefa de A", async () => {
    const savedEngine = process.env.STUDYFLOW_VOZ_ENGINE;
    process.env.STUDYFLOW_VOZ_ENGINE = "fake";
    _resetJobsForTests();
    try {
      // Estudo de A com 2 células (o do beforeEach tem só 1) e a tarefa de A, criada com a sessão dele.
      const cells = JSON.stringify([
        { id: "v1", texto: "Primeira de A." },
        { id: "v2", texto: "Segunda de A." },
      ]);
      const vozStudy = await db.studyRecord.create({
        data: { userId: userA.id, descricao: "Voz de A", pasta: folderA, dataInicial: "2026-08-04", conteudo: cells },
      });
      await signInAs(userA);
      const created = await createJob(userA.id, { studyId: vozStudy.id, start: 1, end: 2, mode: "gravar" });
      expect(created.ok).toBe(true);
      const jobId = created.ok ? created.id : "";
      const until = performance.now() + 15_000;
      while (getJobStatus(userA.id, jobId)?.state !== "pronto" && performance.now() < until) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(getJobStatus(userA.id, jobId)?.state).toBe("pronto");
      const snapA = await snapshot(userA.id);

      await signInAs(userB);
      const notFound = { ok: false, status: 404, message: "Estudo não encontrado." };
      expect(await createJob(userB.id, { studyId: vozStudy.id, start: 1, end: 2, mode: "gravar" })).toEqual(notFound);
      expect(await createJob(userB.id, { studyId: ids.trashedStudy, start: 1, end: 2, mode: "ler" })).toEqual(notFound);
      const post = await postVozJob(
        new Request("http://localhost:3000/api/voz/jobs", {
          method: "POST",
          headers: { host: "localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ studyId: vozStudy.id, start: 1, end: 2, mode: "gravar" }),
        }),
      );
      expect(post.status).toBe(404);

      expect(getJobStatus(userB.id, jobId)).toBeNull();
      expect(getCellMp3(userB.id, jobId, 1)).toBeNull();
      expect(getFullMp3(userB.id, jobId)).toBeNull();
      expect(cancelJob(userB.id, jobId)).toBe(false);
      const ctx = { params: Promise.resolve({ id: jobId }) };
      const url = `http://localhost:3000/api/voz/jobs/${jobId}`;
      const headers = { host: "localhost:3000" };
      expect((await getVozJob(new Request(url, { headers }), ctx)).status).toBe(404);
      expect((await deleteVozJob(new Request(url, { method: "DELETE", headers }), ctx)).status).toBe(404);
      expect((await downloadVozJob(new Request(`${url}/download`, { headers }), ctx)).status).toBe(404);
      const cellCtx = { params: Promise.resolve({ id: jobId, n: "1" }) };
      expect((await getVozCell(new Request(`${url}/cells/1`, { headers }), cellCtx)).status).toBe(404);

      // A tarefa de A continua pronta e baixável por A; nada de A mudou no banco.
      await signInAs(userA);
      expect(getJobStatus(userA.id, jobId)?.state).toBe("pronto");
      expect(getFullMp3(userA.id, jobId)).not.toBeNull();
      expect(await snapshot(userA.id)).toEqual(snapA);
    } finally {
      _resetJobsForTests();
      if (savedEngine === undefined) delete process.env.STUDYFLOW_VOZ_ENGINE;
      else process.env.STUDYFLOW_VOZ_ENGINE = savedEngine;
    }
  });

  it("IA: a chave de A nunca é usada em chamadas de B", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const request = new Request("http://localhost:3000/api/ai/modelos", {
        method: "POST",
        headers: { host: "localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ baseUrl: "https://gateway-de-a/v1" }),
      });
      await modelos(request);
      for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
        expect(JSON.stringify(call)).not.toContain(A_KEY);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("controle: A, com a própria sessão, continua vendo e editando o que é dele", () => {
  beforeEach(async () => {
    signOut();
    await signInAs(userA);
  });

  it("lê os próprios dados", async () => {
    const page = await listStudyRecords({});
    expect(page.items.map((item) => item.id)).toEqual([ids.study]);
    expect((await getStudyDocument(ids.study))?.cells).toEqual([{ id: "c1", texto: "Conteúdo secreto de A" }]);
    expect(await getStudyFolder(ids.study)).toBe(folderA);
    expect((await listStudyCards(ids.study)).map((card) => card.id)).toEqual([ids.card]);
    expect((await listUserSchedules()).map((s) => s.id)).toEqual([ids.schedule]);
    expect(await checkStudyHasActiveSchedules(ids.study)).toBe(true);
    expect((await getAiSettings()).hasKey).toBe(true);

    const cards = await getCards(new NextRequest(`http://localhost/api/cards?studyId=${ids.study}`));
    expect(((await cards.json()) as { id: string }[]).map((card) => card.id)).toEqual([ids.card]);
    const summary = (await (await getSummary()).json()) as { studyId: string; totalAttempts: number }[];
    expect(summary).toMatchObject([{ studyId: ids.study, totalAttempts: 1 }]);
    expect(await listStudyTestSummaries()).toMatchObject([{ studyId: ids.study, totalCards: 1, accuracyPercent: 100 }]);
    expect(await getCardAccuracy(ids.card)).toEqual({ ok: true, data: { accuracyPercent: 100, attempts: 1 } });

    const image = await getImage(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: ids.study, arquivo: "foto.png" }),
    });
    expect(image.status).toBe(200);
  });

  it("edita os próprios dados", async () => {
    expect((await saveStudyContent(ids.study, [{ id: "c1", texto: "novo" }])).ok).toBe(true);
    expect((await updateCard(ids.card, { tema: "Novo", pergunta: "P", resposta: "R" })).ok).toBe(true);
    expect((await recordCardResult(ids.card, ids.study, false)).ok).toBe(true);
    expect((await updateLastTested(ids.study)).ok).toBe(true);
    expect((await restoreCard(ids.trashedCard)).ok).toBe(true);
    expect((await deleteCard(ids.card)).ok).toBe(true);
    expect((await completeSchedule(ids.schedule)).ok).toBe(true);
    expect((await deleteSchedule(ids.schedule)).ok).toBe(true);
    expect((await createSchedules({ studyId: ids.study, studyName: "Estudo de A", force: true })).ok).toBe(true);
    expect((await restoreStudyRecord(ids.trashedStudy)).ok).toBe(true);
    expect((await deleteStudyRecord(ids.study)).ok).toBe(true);
  });
});
