// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { clearUserDataForSeed } from "../../prisma/seed-guard";
import { db } from "@/lib/db";
import { createTestUser } from "./helpers/auth";

async function wipe() {
  await db.cardResult.deleteMany();
  await db.schedule.deleteMany();
  await db.card.deleteMany();
  await db.studyRecord.deleteMany();
  await db.aiSettings.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
}

beforeEach(wipe);

/** Estudo ativo, Estudo na lixeira, Card, resultado e agenda do usuário. */
async function seedData(userId: string, tag: string) {
  const study = await db.studyRecord.create({
    data: { userId, descricao: `Ativo ${tag}`, pasta: `C:\${tag}\a`, dataInicial: "2026-01-01" },
  });
  const trashed = await db.studyRecord.create({
    data: { userId, descricao: `Lixeira ${tag}`, pasta: `C:\${tag}\b`, dataInicial: "2026-01-01", deletedAt: new Date() },
  });
  const card = await db.card.create({
    data: { userId, studyId: study.id, cellId: "c1", tema: "t", pergunta: "p", resposta: "r" },
  });
  await db.cardResult.create({ data: { userId, studyId: study.id, cardId: card.id, correct: true } });
  await db.schedule.create({
    data: { userId, studyId: trashed.id, reviewDate: "2026-02-01", createdAt: "2026-01-01", session: "S1" },
  });
}

async function counts(userId: string) {
  return {
    studies: await db.studyRecord.count({ where: { userId } }),
    cards: await db.card.count({ where: { userId } }),
    results: await db.cardResult.count({ where: { userId } }),
    schedules: await db.schedule.count({ where: { userId } }),
  };
}

describe("clearUserDataForSeed", () => {
  it("recusa quando há dados e force é false, sem apagar nada", async () => {
    const user = await createTestUser({ role: "SUPER" });
    await seedData(user.id, "a");
    const before = await counts(user.id);
    expect(before).toEqual({ studies: 2, cards: 1, results: 1, schedules: 1 });

    await expect(clearUserDataForSeed(user.id, { force: false })).rejects.toThrow(/SEED_FORCE=1/);
    await expect(clearUserDataForSeed(user.id, { force: false })).rejects.toThrow(/2 estudos/);
    expect(await counts(user.id)).toEqual(before);
  });

  it("recusa mesmo quando só existe uma agenda (dado misto)", async () => {
    const user = await createTestUser({ role: "SUPER" });
    const study = await db.studyRecord.create({
      data: { userId: user.id, descricao: "E", pasta: "C:\\x", dataInicial: "2026-01-01" },
    });
    await db.schedule.create({
      data: { userId: user.id, studyId: study.id, reviewDate: "2026-02-01", createdAt: "2026-01-01", session: "S1" },
    });
    await expect(clearUserDataForSeed(user.id, { force: false })).rejects.toThrow(/1 agendamento/);
    expect(await db.schedule.count({ where: { userId: user.id } })).toBe(1);
    expect(await db.studyRecord.count({ where: { userId: user.id } })).toBe(1);
  });

  it("com force apaga tudo do usuário (inclusive a lixeira) e nada de outro usuário", async () => {
    const user = await createTestUser({ role: "SUPER" });
    const other = await createTestUser({ email: "outro@x.com" });
    await seedData(user.id, "a");
    await seedData(other.id, "b");
    const otherBefore = await counts(other.id);

    await clearUserDataForSeed(user.id, { force: true });

    expect(await counts(user.id)).toEqual({ studies: 0, cards: 0, results: 0, schedules: 0 });
    expect(await counts(other.id)).toEqual(otherBefore);
    expect(await db.user.count({ where: { id: user.id } })).toBe(1);
  });

  it("usuário sem dados funciona sem force", async () => {
    const user = await createTestUser({ role: "SUPER" });
    await expect(clearUserDataForSeed(user.id, { force: false })).resolves.toBeUndefined();
    expect(await counts(user.id)).toEqual({ studies: 0, cards: 0, results: 0, schedules: 0 });
  });
});
