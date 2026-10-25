// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createStudyRecord,
  deleteStudyRecord,
  restoreStudyRecord,
  updateStudyRecord,
} from "@/features/estudo/actions";
import { listStudyRecords } from "@/features/estudo/queries";
import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { toIsoDate } from "@/lib/dates";

const NOT_FOUND = { ok: false, message: "Registro não encontrado." };
const DUPLICATE = { ok: false, fieldErrors: { pasta: "Já existe um Estudo usando esta pasta." } };
const MKDIR_FAILED = { ok: false, fieldErrors: { pasta: "Não foi possível criar a pasta." } };

// Pastas reais, sempre dentro de uma pasta temporária deste arquivo (apagada no fim).
let base: string;
let input: { descricao: string; pasta: string; dataInicial: string };

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-data-"));
  input = { descricao: "Cálculo I", pasta: path.join(base, "Calculo"), dataInicial: "2026-08-04" };
});

afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

async function insert(userId: string, descricao: string, updatedAt: Date, pasta = path.join(base, "Geral")) {
  return db.studyRecord.create({
    data: { userId, descricao, pasta, dataInicial: "2026-08-04", updatedAt },
  });
}

async function isDirectory(target: string) {
  return fs.stat(target).then(
    (stat) => stat.isDirectory(),
    () => false,
  );
}

async function insertMany(userId: string, count: number) {
  for (let i = 1; i <= count; i++) {
    await insert(userId, `Tema ${i}`, new Date(2026, 0, i, 12));
  }
}

beforeEach(async () => {
  await db.studyRecord.deleteMany();
  await db.user.deleteMany();
});

describe("createStudyRecord", () => {
  it("grava e aparece na lista com a data de atualização de hoje", async () => {
    const result = await createStudyRecord(input);
    expect(result.ok).toBe(true);

    const page = await listStudyRecords({});
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ ...input, dataAtualizacao: toIsoDate(new Date()) });
  });

  it("com entrada inválida devolve fieldErrors e não grava nada", async () => {
    const result = await createStudyRecord({ ...input, descricao: "   " });
    expect(result).toEqual({ ok: false, fieldErrors: { descricao: "Informe uma descrição." } });
    expect(await db.studyRecord.count()).toBe(0);
  });

  it("guarda HTML na descrição sem alterar (o escape é da renderização)", async () => {
    const descricao = "<img src=x onerror=alert(1)>";
    await createStudyRecord({ ...input, descricao });
    const page = await listStudyRecords({});
    expect(page.items[0].descricao).toBe(descricao);
  });
});

describe("updateStudyRecord", () => {
  it("altera os campos", async () => {
    const created = await createStudyRecord(input);
    if (!created.ok) throw new Error("create falhou");

    const exatas = path.join(base, "Exatas");
    const result = await updateStudyRecord(created.data.id, {
      descricao: "Cálculo II",
      pasta: exatas,
      dataInicial: "2026-09-01",
    });
    expect(result.ok).toBe(true);

    const [item] = (await listStudyRecords({})).items;
    expect(item).toMatchObject({ descricao: "Cálculo II", pasta: exatas, dataInicial: "2026-09-01" });
  });

  it("com dados inválidos devolve fieldErrors e mantém o registro", async () => {
    const created = await createStudyRecord(input);
    if (!created.ok) throw new Error("create falhou");

    const result = await updateStudyRecord(created.data.id, { ...input, dataInicial: "2026-02-30" });
    expect(result).toEqual({ ok: false, fieldErrors: { dataInicial: "Informe uma data válida." } });
    expect((await listStudyRecords({})).items[0].dataInicial).toBe("2026-08-04");
  });
});

describe("pasta física", () => {
  it("criar com uma pasta inexistente cria a pasta no disco", async () => {
    const pasta = path.join(base, "Nova", "Sub");
    expect(await isDirectory(pasta)).toBe(false);
    const result = await createStudyRecord({ ...input, pasta });
    expect(result.ok).toBe(true);
    expect(await isDirectory(pasta)).toBe(true);
  });

  it("criar com caminho relativo devolve a mensagem de caminho absoluto e não grava", async () => {
    const result = await createStudyRecord({ ...input, pasta: "Matemática" });
    expect(result).toEqual({
      ok: false,
      fieldErrors: { pasta: "Informe um caminho absoluto, como C:\\Estudos\\Cálculo." },
    });
    expect(await db.studyRecord.count()).toBe(0);
  });

  it("criar com a pasta de um Estudo ativo (mesmo com caixa e barra final diferentes) é recusado", async () => {
    expect((await createStudyRecord(input)).ok).toBe(true);
    expect(await createStudyRecord({ ...input, descricao: "Outro" })).toEqual(DUPLICATE);
    expect(await createStudyRecord({ ...input, pasta: `${input.pasta.toUpperCase()}\\` })).toEqual(DUPLICATE);
    expect(await db.studyRecord.count()).toBe(1);
  });

  it("a pasta de um Estudo excluído pode ser reutilizada", async () => {
    const created = await createStudyRecord(input);
    if (!created.ok) throw new Error("create falhou");
    await deleteStudyRecord(created.data.id);
    expect((await createStudyRecord({ ...input, descricao: "Cálculo I (de novo)" })).ok).toBe(true);
  });

  it("a pasta de um Estudo de outro usuário não conta como duplicada", async () => {
    await getCurrentUserId();
    const other = await db.user.create({ data: { name: "Outro" } });
    await insert(other.id, "Alheio", new Date(2026, 0, 1, 12), input.pasta);
    expect((await createStudyRecord(input)).ok).toBe(true);
  });

  it("criar com uma pasta impossível devolve 'Não foi possível criar a pasta.' e não grava", async () => {
    const file = path.join(base, "arquivo.txt");
    await fs.writeFile(file, "x");
    const result = await createStudyRecord({ ...input, pasta: path.join(file, "sub") });
    expect(result).toEqual(MKDIR_FAILED);
    expect(await db.studyRecord.count()).toBe(0);
  });

  it("editar sem mudar a pasta não acusa o próprio Estudo como duplicado", async () => {
    const created = await createStudyRecord(input);
    if (!created.ok) throw new Error("create falhou");
    expect((await updateStudyRecord(created.data.id, { ...input, descricao: "Cálculo II" })).ok).toBe(true);
    expect((await updateStudyRecord(created.data.id, { ...input, pasta: `${input.pasta}\\` })).ok).toBe(true);
  });

  it("editar para a pasta de outro Estudo ativo é recusado e mantém o registro", async () => {
    const a = await createStudyRecord(input);
    const b = await createStudyRecord({ ...input, descricao: "B", pasta: path.join(base, "B") });
    if (!a.ok || !b.ok) throw new Error("create falhou");
    expect(await updateStudyRecord(b.data.id, { ...input, descricao: "B" })).toEqual(DUPLICATE);
    const pastas = (await listStudyRecords({})).items.map((r) => r.pasta).sort();
    expect(pastas).toEqual([input.pasta, path.join(base, "B")].sort());
  });

  it("editar para outra pasta copia imagens\\ para a nova e deixa a antiga intacta", async () => {
    const created = await createStudyRecord(input);
    if (!created.ok) throw new Error("create falhou");
    const oldImages = path.join(input.pasta, "imagens");
    await fs.mkdir(oldImages, { recursive: true });
    await fs.writeFile(path.join(oldImages, "foto.png"), "png");

    const nova = path.join(base, "Movida");
    expect((await updateStudyRecord(created.data.id, { ...input, pasta: nova })).ok).toBe(true);

    expect(await fs.readFile(path.join(nova, "imagens", "foto.png"), "utf8")).toBe("png");
    expect(await fs.readFile(path.join(oldImages, "foto.png"), "utf8")).toBe("png");
  });

  it("registros legados com pasta fora do padrão continuam aparecendo na listagem", async () => {
    const userId = await getCurrentUserId();
    await insert(userId, "Legado", new Date(2026, 0, 1, 12), "Matemática");
    const [item] = (await listStudyRecords({})).items;
    expect(item).toMatchObject({ descricao: "Legado", pasta: "Matemática" });
  });

  it("editar um registro legado para uma pasta válida cria a pasta e grava", async () => {
    const userId = await getCurrentUserId();
    const legado = await insert(userId, "Legado", new Date(2026, 0, 1, 12), "Matemática");
    const pasta = path.join(base, "Corrigida");
    expect((await updateStudyRecord(legado.id, { ...input, pasta })).ok).toBe(true);
    expect(await isDirectory(pasta)).toBe(true);
    expect((await listStudyRecords({})).items[0].pasta).toBe(pasta);
  });
});

describe("deleteStudyRecord e restoreStudyRecord", () => {
  it("exclui da lista e restaura na mesma posição, com a mesma data de atualização", async () => {
    const userId = await getCurrentUserId();
    const a = await insert(userId, "A", new Date(2026, 0, 1, 12));
    await insert(userId, "B", new Date(2026, 1, 1, 12));
    const before = (await listStudyRecords({})).items.map((r) => r.descricao);
    expect(before).toEqual(["B", "A"]);

    expect((await deleteStudyRecord(a.id)).ok).toBe(true);
    expect((await listStudyRecords({})).items.map((r) => r.descricao)).toEqual(["B"]);

    expect((await restoreStudyRecord(a.id)).ok).toBe(true);
    const after = (await listStudyRecords({})).items;
    expect(after.map((r) => r.descricao)).toEqual(before);
    expect(after[1].dataAtualizacao).toBe("2026-01-01");
  });

  it("excluir um registro já excluído devolve 'Registro não encontrado.'", async () => {
    const userId = await getCurrentUserId();
    const a = await insert(userId, "A", new Date(2026, 0, 1, 12));
    await deleteStudyRecord(a.id);
    expect(await deleteStudyRecord(a.id)).toEqual(NOT_FOUND);
  });

  it("restaurar um registro que não está excluído devolve 'Registro não encontrado.'", async () => {
    const userId = await getCurrentUserId();
    const a = await insert(userId, "A", new Date(2026, 0, 1, 12));
    expect(await restoreStudyRecord(a.id)).toEqual(NOT_FOUND);
  });
});

describe("ids inexistentes ou de outro usuário", () => {
  it("update, delete e restore com id inexistente devolvem 'Registro não encontrado.'", async () => {
    expect(await updateStudyRecord("nao-existe", input)).toEqual(NOT_FOUND);
    expect(await deleteStudyRecord("nao-existe")).toEqual(NOT_FOUND);
    expect(await restoreStudyRecord("nao-existe")).toEqual(NOT_FOUND);
  });

  it("registro de outro usuário não aparece na lista nem pode ser alterado", async () => {
    await getCurrentUserId();
    const other = await db.user.create({ data: { name: "Outro" } });
    const foreign = await insert(other.id, "Alheio", new Date(2026, 0, 1, 12));
    await db.studyRecord.update({ where: { id: foreign.id }, data: { deletedAt: new Date() } });
    const visible = await insert(other.id, "Alheio visível", new Date(2026, 0, 2, 12));

    expect((await listStudyRecords({})).totalAll).toBe(0);
    expect(await updateStudyRecord(visible.id, input)).toEqual(NOT_FOUND);
    expect(await deleteStudyRecord(visible.id)).toEqual(NOT_FOUND);
    expect(await restoreStudyRecord(foreign.id)).toEqual(NOT_FOUND);
  });
});

describe("listStudyRecords", () => {
  it("pagina de 5 em 5: com 7 registros a página 2 tem 2 itens", async () => {
    await insertMany(await getCurrentUserId(), 7);
    const page = await listStudyRecords({ page: 2 });
    expect(page.items).toHaveLength(2);
    expect(page).toMatchObject({ total: 7, totalAll: 7, totalPages: 2, start: 5 });
  });

  it("ordena por atualização mais recente primeiro", async () => {
    await insertMany(await getCurrentUserId(), 3);
    const names = (await listStudyRecords({})).items.map((r) => r.descricao);
    expect(names).toEqual(["Tema 3", "Tema 2", "Tema 1"]);
  });

  it("busca sem diferenciar acento", async () => {
    const userId = await getCurrentUserId();
    await insert(userId, "Cálculo I", new Date(2026, 0, 1, 12));
    await insert(userId, "Anatomia", new Date(2026, 0, 2, 12));
    const page = await listStudyRecords({ q: "calculo" });
    expect(page.items.map((r) => r.descricao)).toEqual(["Cálculo I"]);
    expect(page.totalAll).toBe(2);
  });

  it("depois de excluir o único item da página 2, listar a página 2 devolve a página 1", async () => {
    const userId = await getCurrentUserId();
    await insertMany(userId, 6);
    const lastOnPage2 = (await listStudyRecords({ page: 2 })).items[0];
    await deleteStudyRecord(lastOnPage2.id);
    const page = await listStudyRecords({ page: 2 });
    expect(page.page).toBe(1);
    expect(page.items).toHaveLength(5);
  });
});

describe("id que não é um texto válido", () => {
  const filterObject = { not: "" } as unknown as string;

  it("objeto de filtro como id não atinge nenhum registro (update, delete e restore)", async () => {
    const userId = await getCurrentUserId();
    await insert(userId, "A", new Date(2026, 0, 1, 12));
    await insert(userId, "B", new Date(2026, 0, 2, 12));

    expect(await updateStudyRecord(filterObject, { ...input, descricao: "HACK" })).toEqual(NOT_FOUND);
    expect(await deleteStudyRecord(filterObject)).toEqual(NOT_FOUND);
    const visible = (await listStudyRecords({})).items.map((r) => r.descricao);
    expect(visible).toEqual(["B", "A"]);

    await db.studyRecord.updateMany({ data: { deletedAt: new Date() } });
    expect(await restoreStudyRecord(filterObject)).toEqual(NOT_FOUND);
    expect((await listStudyRecords({})).totalAll).toBe(0);
  });

  it("id vazio e ids de outros tipos devolvem 'Registro não encontrado.'", async () => {
    for (const id of ["", 42, null, undefined] as unknown as string[]) {
      expect(await updateStudyRecord(id, input)).toEqual(NOT_FOUND);
      expect(await deleteStudyRecord(id)).toEqual(NOT_FOUND);
      expect(await restoreStudyRecord(id)).toEqual(NOT_FOUND);
    }
  });
});
