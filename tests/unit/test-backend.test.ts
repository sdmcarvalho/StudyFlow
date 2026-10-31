// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => import("./helpers/next-headers"));

import { completeSchedule } from "@/features/agenda/actions";
import { getCardAccuracy, recordCardResult, updateLastTested } from "@/features/cards/actions";
import { listStudyTestSummaries } from "@/features/cards/queries";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

type Person = Awaited<ReturnType<typeof createTestUser>>;
let me: Person;
let other: Person;

async function clearDatabase() {
  await db.cardResult.deleteMany();
  await db.schedule.deleteMany();
  await db.card.deleteMany();
  await db.studyRecord.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
}

afterAll(async () => {
  await clearDatabase();
});

beforeEach(async () => {
  await clearDatabase();
  signOut();
  me = await createTestUser({ name: "Ana" });
  other = await createTestUser({ name: "Beto" });
  await signInAs(me);
});

const OLD = new Date("2026-01-01T10:00:00.000Z");

function study(userId: string, data: { descricao?: string; updatedAt?: Date; deletedAt?: Date; lastTestedAt?: Date } = {}) {
  return db.studyRecord.create({
    data: {
      userId,
      descricao: data.descricao ?? "Estudo",
      pasta: "C:\\StudyFlow\\x",
      dataInicial: "2026-08-04",
      updatedAt: data.updatedAt,
      deletedAt: data.deletedAt,
      lastTestedAt: data.lastTestedAt,
    },
  });
}

function card(userId: string, studyId: string, data: { createdAt?: Date; deletedAt?: Date } = {}) {
  return db.card.create({
    data: { userId, studyId, cellId: "c1", tema: "T", pergunta: "P", resposta: "R", ...data },
  });
}

function result(userId: string, studyId: string, cardId: string, correct: boolean) {
  return db.cardResult.create({ data: { userId, studyId, cardId, correct } });
}

describe("listStudyTestSummaries", () => {
  it("resume só cards ativos e seus resultados, com datas ISO", async () => {
    const s = await study(me.id, { descricao: "Cálculo", lastTestedAt: new Date("2026-09-10T12:00:00.000Z") });
    const active = await card(me.id, s.id, { createdAt: new Date("2026-08-05T08:00:00.000Z") });
    const trashed = await card(me.id, s.id, {
      createdAt: new Date("2026-09-01T08:00:00.000Z"),
      deletedAt: new Date(),
    });
    await result(me.id, s.id, active.id, true);
    await result(me.id, s.id, active.id, true);
    await result(me.id, s.id, active.id, false);
    await result(me.id, s.id, active.id, true);
    await result(me.id, s.id, trashed.id, false);
    await result(me.id, s.id, trashed.id, false);

    expect(await listStudyTestSummaries()).toEqual([
      {
        studyId: s.id,
        studyName: "Cálculo",
        lastCardCreated: "2026-08-05T08:00:00.000Z",
        lastTested: "2026-09-10T12:00:00.000Z",
        totalCards: 1,
        correctAnswers: 3,
        totalAttempts: 4,
        accuracyPercent: 75,
      },
    ]);
  });

  it("sem tentativas: accuracyPercent null, totalAttempts 0, lastTested null; lastCardCreated é o card ativo mais novo", async () => {
    const s = await study(me.id);
    await card(me.id, s.id, { createdAt: new Date("2026-08-05T08:00:00.000Z") });
    await card(me.id, s.id, { createdAt: new Date("2026-08-07T08:00:00.000Z") });
    await card(me.id, s.id, { createdAt: new Date("2026-08-09T08:00:00.000Z"), deletedAt: new Date() });

    expect(await listStudyTestSummaries()).toEqual([
      {
        studyId: s.id,
        studyName: "Estudo",
        lastCardCreated: "2026-08-07T08:00:00.000Z",
        lastTested: null,
        totalCards: 2,
        correctAnswers: 0,
        totalAttempts: 0,
        accuracyPercent: null,
      },
    ]);
  });

  it("omite Estudo sem card ativo, Estudo excluído e Estudo de outro usuário; ordena por updatedAt desc", async () => {
    const older = await study(me.id, { descricao: "Antigo", updatedAt: new Date("2026-02-01T00:00:00.000Z") });
    const newer = await study(me.id, { descricao: "Novo", updatedAt: new Date("2026-03-01T00:00:00.000Z") });
    await card(me.id, older.id);
    await card(me.id, newer.id);

    const onlyTrashedCards = await study(me.id);
    await card(me.id, onlyTrashedCards.id, { deletedAt: new Date() });
    await study(me.id); // sem cards
    const trashedStudy = await study(me.id, { deletedAt: new Date() });
    await card(me.id, trashedStudy.id);
    const foreign = await study(other.id);
    await card(other.id, foreign.id);

    const summaries = await listStudyTestSummaries();
    expect(summaries.map((s) => s.studyId)).toEqual([newer.id, older.id]);
  });
});

describe("recordCardResult", () => {
  it("grava um resultado certo e um errado", async () => {
    const s = await study(me.id);
    const c = await card(me.id, s.id);
    expect(await recordCardResult(c.id, s.id, true)).toEqual({ ok: true, data: undefined });
    expect(await recordCardResult(c.id, s.id, false)).toEqual({ ok: true, data: undefined });
    const rows = await db.cardResult.findMany({ where: { cardId: c.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.correct).sort()).toEqual([false, true]);
    expect(rows.every((r) => r.userId === me.id && r.studyId === s.id)).toBe(true);
  });

  it("rejeita entradas inválidas sem gravar nada", async () => {
    const s = await study(me.id);
    const c = await card(me.id, s.id);
    const bad: [unknown, unknown, unknown][] = [
      [c.id, s.id, "true"],
      [c.id, s.id, 1],
      [c.id, s.id, undefined],
      ["", s.id, true],
      [c.id, "", true],
      [42, s.id, true],
      [c.id, null, true],
    ];
    for (const [cardId, studyId, correct] of bad) {
      const res = await recordCardResult(cardId as string, studyId as string, correct as boolean);
      expect(res.ok).toBe(false);
    }
    expect(await db.cardResult.count()).toBe(0);
  });

  it("recusa card de outro usuário, de outro Estudo, excluído ou de Estudo excluído", async () => {
    const s = await study(me.id);
    const s2 = await study(me.id);
    const cardOfS2 = await card(me.id, s2.id);
    const trashedCard = await card(me.id, s.id, { deletedAt: new Date() });
    const trashedStudy = await study(me.id, { deletedAt: new Date() });
    const cardOfTrashedStudy = await card(me.id, trashedStudy.id);
    const foreignStudy = await study(other.id);
    const foreignCard = await card(other.id, foreignStudy.id);

    expect((await recordCardResult(foreignCard.id, foreignStudy.id, true)).ok).toBe(false);
    expect((await recordCardResult(cardOfS2.id, s.id, true)).ok).toBe(false);
    expect((await recordCardResult(trashedCard.id, s.id, true)).ok).toBe(false);
    expect((await recordCardResult(cardOfTrashedStudy.id, trashedStudy.id, true)).ok).toBe(false);
    expect(await db.cardResult.count()).toBe(0);
  });
});

describe("getCardAccuracy", () => {
  it("calcula a taxa de acerto do card", async () => {
    const s = await study(me.id);
    const c = await card(me.id, s.id);
    await result(me.id, s.id, c.id, true);
    await result(me.id, s.id, c.id, false);
    await result(me.id, s.id, c.id, true);
    const res = await getCardAccuracy(c.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.attempts).toBe(3);
    expect(res.data.accuracyPercent).toBeCloseTo(66.6667, 3);
  });

  it("sem resultados: accuracyPercent null e attempts 0", async () => {
    const s = await study(me.id);
    const c = await card(me.id, s.id);
    expect(await getCardAccuracy(c.id)).toEqual({ ok: true, data: { accuracyPercent: null, attempts: 0 } });
  });

  it("recusa card de outro usuário, card excluído e id inválido", async () => {
    const s = await study(me.id);
    const trashed = await card(me.id, s.id, { deletedAt: new Date() });
    const foreignStudy = await study(other.id);
    const foreign = await card(other.id, foreignStudy.id);
    await result(other.id, foreignStudy.id, foreign.id, true);
    expect((await getCardAccuracy(foreign.id)).ok).toBe(false);
    expect((await getCardAccuracy(trashed.id)).ok).toBe(false);
    expect((await getCardAccuracy("")).ok).toBe(false);
  });

  it("recusa card ativo dentro de um Estudo excluído", async () => {
    const trashedStudy = await study(me.id, { deletedAt: new Date() });
    const c = await card(me.id, trashedStudy.id);
    await result(me.id, trashedStudy.id, c.id, true);
    expect((await getCardAccuracy(c.id)).ok).toBe(false);
  });
});

describe("completeSchedule", () => {
  const schedule = (studyId: string, status: string) =>
    db.schedule.create({
      data: { userId: me.id, studyId, reviewDate: "2026-11-01", createdAt: "2026-10-31", session: "24 horas", status },
    });

  it("conclui um agendamento Ativo", async () => {
    const s = await study(me.id);
    const sch = await schedule(s.id, "Ativo");
    expect(await completeSchedule(sch.id)).toEqual({ ok: true, data: undefined });
    expect((await db.schedule.findUniqueOrThrow({ where: { id: sch.id } })).status).toBe("Realizado");
  });

  it("concluir um agendamento que já está Realizado devolve 'não encontrado' e não altera nada", async () => {
    const s = await study(me.id);
    const sch = await schedule(s.id, "Realizado");
    const before = await db.schedule.findUniqueOrThrow({ where: { id: sch.id } });
    expect(await completeSchedule(sch.id)).toEqual({ ok: false, message: "Agendamento não encontrado." });
    expect(await db.schedule.findUniqueOrThrow({ where: { id: sch.id } })).toEqual(before);
  });
});

describe("updateLastTested", () => {
  it("preenche lastTestedAt sem mudar o updatedAt do Estudo", async () => {
    const s = await study(me.id, { updatedAt: OLD });
    const startedAt = Date.now();
    expect(await updateLastTested(s.id)).toEqual({ ok: true, data: undefined });
    const after = await db.studyRecord.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.updatedAt.toISOString()).toBe(OLD.toISOString());
    expect(after.lastTestedAt).not.toBeNull();
    expect(after.lastTestedAt!.getTime()).toBeGreaterThanOrEqual(startedAt - 1000);
  });

  it("recusa Estudo de outro usuário, Estudo excluído e id inválido, sem alterar nada", async () => {
    const foreign = await study(other.id, { updatedAt: OLD });
    const trashed = await study(me.id, { updatedAt: OLD, deletedAt: new Date() });
    expect((await updateLastTested(foreign.id)).ok).toBe(false);
    expect((await updateLastTested(trashed.id)).ok).toBe(false);
    expect((await updateLastTested("")).ok).toBe(false);
    for (const id of [foreign.id, trashed.id]) {
      const row = await db.studyRecord.findUniqueOrThrow({ where: { id } });
      expect(row.lastTestedAt).toBeNull();
      expect(row.updatedAt.toISOString()).toBe(OLD.toISOString());
    }
  });
});
