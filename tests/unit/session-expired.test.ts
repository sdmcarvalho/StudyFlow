// @vitest-environment node
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => import("./helpers/next-headers"));

import { GET as getImage } from "@/app/(app)/estudo/[id]/imagens/[arquivo]/route";
import { generateMetadata } from "@/app/(app)/estudo/[id]/page";
import { POST as postImage } from "@/app/(app)/estudo/[id]/imagens/route";
import { POST as modelos } from "@/app/api/ai/modelos/route";
import { POST as testar } from "@/app/api/ai/testar/route";
import { GET as getCards } from "@/app/api/cards/route";
import { GET as getFolders, POST as postFolder } from "@/app/api/pastas/route";
import { GET as getSummary } from "@/app/api/testes/resumo/route";
import * as agenda from "@/features/agenda/actions";
import * as ai from "@/features/ai/actions";
import { getAiSettings } from "@/features/ai/queries";
import * as cards from "@/features/cards/actions";
import { listStudyCards, listStudyTestSummaries } from "@/features/cards/queries";
import * as estudo from "@/features/estudo/actions";
import { getStudyDocument, getStudyFolder, listStudyRecords } from "@/features/estudo/queries";
import * as voz from "@/features/voz/actions";
import { getVoiceSettings } from "@/features/voz/queries";
import { AuthError } from "@/lib/current-user";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

afterAll(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
});

const EXPIRED = { ok: false, message: "Sessão expirada, entre novamente." };

// Argumentos válidos para cada action: a validação de entrada roda antes da sessão e não pode mascarar o teste.
const studyInput = { descricao: "Estudo", pasta: "C:\\StudyFlow\\ana\\Estudo", dataInicial: "2026-08-04" };
const cardInput = { tema: "Tema", pergunta: "Pergunta", resposta: "Resposta" };
const aiInput = {
  baseUrl: "https://gateway/v1",
  apiKey: "",
  model: "m1",
  temperature: 0.2,
  timeout: 300,
  extraParams: "",
};

const vozInput = { voice: "pt_BR-faber-medium", speed: 1, volume: 1 };

const actionCalls: Record<string, () => Promise<unknown>> = {
  "estudo.createStudyRecord": () => estudo.createStudyRecord(studyInput),
  "estudo.updateStudyRecord": () => estudo.updateStudyRecord("id-1", studyInput),
  "estudo.saveStudyContent": () => estudo.saveStudyContent("id-1", [{ id: "c1", texto: "x" }]),
  "estudo.deleteStudyRecord": () => estudo.deleteStudyRecord("id-1"),
  "estudo.restoreStudyRecord": () => estudo.restoreStudyRecord("id-1"),
  "cards.createCard": () => cards.createCard("id-1", "c1", cardInput),
  "cards.updateCard": () => cards.updateCard("id-1", cardInput),
  "cards.deleteCard": () => cards.deleteCard("id-1"),
  "cards.restoreCard": () => cards.restoreCard("id-1"),
  "cards.recordCardResult": () => cards.recordCardResult("id-1", "id-2", true),
  "cards.getCardAccuracy": () => cards.getCardAccuracy("id-1"),
  "cards.updateLastTested": () => cards.updateLastTested("id-1"),
  "agenda.createSchedules": () => agenda.createSchedules({ studyId: "id-1", studyName: "Estudo" }),
  "agenda.completeSchedule": () => agenda.completeSchedule("id-1"),
  "agenda.deleteSchedule": () => agenda.deleteSchedule("id-1"),
  "ai.saveAiSettings": () => ai.saveAiSettings(aiInput),
  "ai.generateCardQuestion": () => ai.generateCardQuestion("Texto"),
  "ai.generateCardAnswer": () => ai.generateCardAnswer("Pergunta?"),
  "ai.summarizeText": () => ai.summarizeText("Texto"),
  "voz.saveVoiceSettings": () => voz.saveVoiceSettings(vozInput),
};

/** Exports que não devolvem `ActionResult`: deixam o AuthError subir para o chamador. */
const throwingCalls: Record<string, () => Promise<unknown>> = {
  "agenda.listUserSchedules": () => agenda.listUserSchedules(),
  "agenda.checkStudyHasActiveSchedules": () => agenda.checkStudyHasActiveSchedules("id-1"),
  "queries.listStudyRecords": () => listStudyRecords({}),
  "queries.getStudyDocument": () => getStudyDocument("id-1"),
  "queries.getStudyFolder": () => getStudyFolder("id-1"),
  "queries.listStudyCards": () => listStudyCards("id-1"),
  "queries.listStudyTestSummaries": () => listStudyTestSummaries(),
  "queries.getAiSettings": () => getAiSettings(),
  "queries.getVoiceSettings": () => getVoiceSettings(),
};

function exportedFunctions(module: Record<string, unknown>): string[] {
  return Object.entries(module)
    .filter(([, value]) => typeof value === "function")
    .map(([name]) => name);
}

function aiPost(handler: (request: Request) => Promise<Response>) {
  return handler(
    new Request("http://localhost:3000/api/ai", {
      method: "POST",
      headers: { host: "localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ baseUrl: "https://gateway/v1", model: "m1" }),
    }),
  );
}

const routeCalls: Record<string, () => Promise<Response>> = {
  "GET /api/cards": () => getCards(new NextRequest("http://localhost/api/cards?studyId=id-1")),
  "GET /api/testes/resumo": () => getSummary(),
  "POST /api/ai/modelos": () => aiPost(modelos),
  "POST /api/ai/testar": () => aiPost(testar),
  "GET /api/pastas": () => getFolders(new Request("http://localhost/api/pastas", { headers: { host: "localhost" } })),
  "POST /api/pastas": () =>
    postFolder(
      new Request("http://localhost/api/pastas", {
        method: "POST",
        headers: { host: "localhost", origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ pai: "C:\\StudyFlow\\ana", nome: "Nova" }),
      }),
    ),
};

const situations: [string, () => Promise<void>][] = [
  ["sem sessão", async () => signOut()],
  [
    "com sessão de usuário desativado depois do login",
    async () => {
      const user = await createTestUser();
      await signInAs(user);
      await db.user.update({ where: { id: user.id }, data: { active: false } });
    },
  ],
];

describe("cobertura da lista de entradas", () => {
  it("toda action exportada tem um caso aqui (uma nova sem teste faz este teste falhar)", () => {
    const exported = [
      ...exportedFunctions(estudo).map((n) => `estudo.${n}`),
      ...exportedFunctions(cards).map((n) => `cards.${n}`),
      ...exportedFunctions(agenda).map((n) => `agenda.${n}`),
      ...exportedFunctions(ai).map((n) => `ai.${n}`),
      ...exportedFunctions(voz).map((n) => `voz.${n}`),
    ].sort();
    const covered = [...Object.keys(actionCalls), "agenda.listUserSchedules", "agenda.checkStudyHasActiveSchedules"].sort();
    expect(exported).toEqual(covered);
    expect(Object.keys(actionCalls)).toHaveLength(20);
  });
});

describe.each(situations)("%s", (_name, setup) => {
  beforeEach(async () => {
    await db.session.deleteMany();
    await db.cardResult.deleteMany();
    await db.schedule.deleteMany();
    await db.card.deleteMany();
    await db.studyRecord.deleteMany();
    await db.aiSettings.deleteMany();
    await db.voiceSettings.deleteMany();
    await db.user.deleteMany();
    signOut();
    await setup();
  });

  it.each(Object.keys(actionCalls))("action %s devolve a mensagem de sessão expirada", async (name) => {
    expect(await actionCalls[name]()).toEqual(EXPIRED);
  });

  it.each(Object.keys(throwingCalls))("%s rejeita com AuthError", async (name) => {
    await expect(throwingCalls[name]()).rejects.toBeInstanceOf(AuthError);
  });

  it.each(Object.keys(routeCalls))("rota %s responde 401 com { message }", async (name) => {
    const response = await routeCalls[name]();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Sessão expirada, entre novamente." });
  });

  it("a imagem do Estudo (GET) responde 404 sem detalhes", async () => {
    const response = await getImage(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "id-1", arquivo: "foto.png" }),
    });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  it("o envio de imagem (POST) responde 401 com { message }", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    const response = await postImage(new Request("http://localhost/x", { method: "POST", body: form }), {
      params: Promise.resolve({ id: "id-1" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Sessão expirada, entre novamente." });
  });

  it("generateMetadata da página do Estudo não consulta o documento e usa o título padrão", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ id: "id-1" }) } as Parameters<typeof generateMetadata>[0]);
    expect(metadata).toEqual({ title: "StudyFlow" });
  });
});
