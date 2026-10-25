// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveStudyContent } from "@/features/estudo/actions";
import { getStudyDocument } from "@/features/estudo/queries";
import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";

const NOT_FOUND = { ok: false, message: "Registro não encontrado." };

async function insert(userId: string, descricao = "Cálculo I", updatedAt = new Date(2026, 0, 1, 12)) {
  return db.studyRecord.create({
    data: { userId, descricao, pasta: "C:\\Estudos\\Geral", dataInicial: "2026-08-04", updatedAt },
  });
}

beforeEach(async () => {
  await db.studyRecord.deleteMany();
  await db.user.deleteMany();
});

describe("getStudyDocument", () => {
  it("registro novo devolve cells vazio, com descricao e pasta", async () => {
    const record = await insert(await getCurrentUserId());
    expect(await getStudyDocument(record.id)).toEqual({
      id: record.id,
      descricao: "Cálculo I",
      pasta: "C:\\Estudos\\Geral",
      cells: [],
    });
  });

  it("conteudo corrompido no banco devolve cells vazio sem lançar", async () => {
    const record = await insert(await getCurrentUserId());
    for (const conteudo of ["{", "", "[1]", '{"a":1}']) {
      await db.studyRecord.update({ where: { id: record.id }, data: { conteudo } });
      const doc = await getStudyDocument(record.id);
      expect(doc?.cells).toEqual([]);
    }
  });
});

describe("saveStudyContent", () => {
  it("grava, devolve as mesmas células na mesma ordem e aumenta updatedAt", async () => {
    const record = await insert(await getCurrentUserId());
    const cells = [
      { id: "z", texto: "# Título" },
      { id: "a", texto: "texto com acento ã" },
      { id: "m", texto: "" },
    ];

    const result = await saveStudyContent(record.id, cells);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Date(result.data.savedAt).toISOString()).toBe(result.data.savedAt);

    expect((await getStudyDocument(record.id))?.cells).toEqual(cells);
    const after = await db.studyRecord.findUniqueOrThrow({ where: { id: record.id } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(record.updatedAt.getTime());
  });

  it("células inválidas (501) devolvem { ok: false } e não gravam", async () => {
    const record = await insert(await getCurrentUserId());
    await saveStudyContent(record.id, [{ id: "a", texto: "original" }]);

    const tooMany = Array.from({ length: 501 }, (_, i) => ({ id: `c${i}`, texto: "x" }));
    const result = await saveStudyContent(record.id, tooMany);
    expect(result.ok).toBe(false);
    expect((await getStudyDocument(record.id))?.cells).toEqual([{ id: "a", texto: "original" }]);
  });

  it("id inexistente, de outro usuário, excluído, vazio ou de outro tipo devolve 'Registro não encontrado.'", async () => {
    const userId = await getCurrentUserId();
    const other = await db.user.create({ data: { name: "Outro" } });
    const foreign = await insert(other.id, "Alheio");
    const deleted = await insert(userId, "Excluído");
    await db.studyRecord.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    const own = await insert(userId, "Meu");
    const cells = [{ id: "a", texto: "HACK" }];

    for (const id of ["nao-existe", foreign.id, deleted.id, "", { not: "" }, 42] as unknown as string[]) {
      expect(await saveStudyContent(id, cells)).toEqual(NOT_FOUND);
    }

    const rows = await db.studyRecord.findMany({ where: { id: { in: [foreign.id, deleted.id, own.id] } } });
    expect(rows.every((r) => r.conteudo === "[]")).toBe(true);
  });
});

describe("getStudyDocument com ids que não pertencem ao usuário", () => {
  it("inexistente, de outro usuário, excluído, vazio ou de outro tipo devolve null", async () => {
    const userId = await getCurrentUserId();
    const other = await db.user.create({ data: { name: "Outro" } });
    const foreign = await insert(other.id, "Alheio");
    const deleted = await insert(userId, "Excluído");
    await db.studyRecord.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    await insert(userId, "Meu");

    for (const id of ["nao-existe", foreign.id, deleted.id, "", { not: "" }, 42] as unknown as string[]) {
      expect(await getStudyDocument(id)).toBeNull();
    }
  });
});
