// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/next-headers"));

import { listUsers } from "@/features/usuarios/queries";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

async function wipe() {
  await db.cardResult.deleteMany();
  await db.schedule.deleteMany();
  await db.card.deleteMany();
  await db.studyRecord.deleteMany();
  await db.aiSettings.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
}

beforeEach(async () => {
  signOut();
  await wipe();
});
afterAll(wipe);

async function addStudy(userId: string, descricao: string, deleted = false) {
  return db.studyRecord.create({
    data: {
      userId,
      descricao,
      pasta: `C:\\${descricao}`,
      dataInicial: "2026-01-01",
      deletedAt: deleted ? new Date() : null,
    },
  });
}

describe("listUsers", () => {
  it("visitante e usuário comum são rejeitados", async () => {
    await expect(listUsers()).rejects.toMatchObject({ code: "unauthenticated" });
    await signInAs(await createTestUser({ role: "USER" }));
    await expect(listUsers()).rejects.toMatchObject({ code: "forbidden" });
  });

  it("SUPER vem primeiro, depois createdAt crescente, com createdAt em ISO", async () => {
    const early = await createTestUser({ name: "Antiga", email: "antiga@x.com" });
    const sup = await createTestUser({ role: "SUPER", name: "Super", email: "super@x.com" });
    const late = await createTestUser({ name: "Nova", email: "nova@x.com" });
    await db.user.update({ where: { id: early.id }, data: { createdAt: new Date("2026-01-01T00:00:00Z") } });
    await db.user.update({ where: { id: sup.id }, data: { createdAt: new Date("2026-03-01T00:00:00Z") } });
    await db.user.update({ where: { id: late.id }, data: { createdAt: new Date("2026-02-01T00:00:00Z") } });
    await signInAs(sup);

    const rows = await listUsers();
    expect(rows.map((row) => row.email)).toEqual(["super@x.com", "antiga@x.com", "nova@x.com"]);
    expect(rows[1].createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(rows[0]).toMatchObject({ role: "SUPER", active: true });
  });

  it("conta só Estudos e Cards não excluídos e todas as agendas, por usuário", async () => {
    const sup = await createTestUser({ role: "SUPER", email: "super@x.com" });
    const ana = await createTestUser({ name: "Ana", email: "ana@x.com", active: false });
    const bia = await createTestUser({ name: "Bia", email: "bia@x.com" });
    await signInAs(sup);

    const s1 = await addStudy(ana.id, "s1");
    const s2 = await addStudy(ana.id, "s2");
    const trashed = await addStudy(ana.id, "s3", true);
    for (const [cellId, deletedAt] of [["a", null], ["b", null], ["c", new Date()]] as const) {
      await db.card.create({ data: { userId: ana.id, studyId: s1.id, cellId, tema: "t", pergunta: "p", deletedAt } });
    }
    for (const studyId of [s2.id, trashed.id]) {
      await db.schedule.create({
        data: { userId: ana.id, studyId, reviewDate: "2026-02-01", createdAt: "2026-01-01", session: "S1" },
      });
    }
    const b1 = await addStudy(bia.id, "b1");
    await db.card.create({ data: { userId: bia.id, studyId: b1.id, cellId: "x", tema: "t", pergunta: "p" } });

    const rows = await listUsers();
    const byEmail = Object.fromEntries(rows.map((row) => [row.email, row]));
    expect(byEmail["ana@x.com"]).toMatchObject({ studyCount: 2, cardCount: 2, scheduleCount: 2, active: false });
    expect(byEmail["bia@x.com"]).toMatchObject({ studyCount: 1, cardCount: 1, scheduleCount: 0 });
    expect(byEmail["super@x.com"]).toMatchObject({ studyCount: 0, cardCount: 0, scheduleCount: 0 });
  });

  it("devolve só os campos de UserRow (sem hash, pasta nem conteúdo)", async () => {
    const sup = await createTestUser({ role: "SUPER", email: "super@x.com" });
    await signInAs(sup);
    await addStudy(sup.id, "segredo");
    const [row] = await listUsers();
    expect(Object.keys(row).sort()).toEqual([
      "active",
      "cardCount",
      "createdAt",
      "email",
      "id",
      "name",
      "role",
      "scheduleCount",
      "studyCount",
    ]);
    expect(JSON.stringify(row)).not.toContain("segredo");
  });
});
