import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  buildListPage,
  buildStudyHref,
  normalize,
  parsePageParam,
  type StudyRecordRow,
} from "@/features/estudo/list";

function row(id: number, descricao: string, pasta: string): StudyRecordRow {
  return { id: String(id), descricao, pasta, dataInicial: "2026-08-04", dataAtualizacao: "2026-10-01" };
}

const rows: StudyRecordRow[] = [
  row(1, "Cálculo I — Limites e derivadas", "Matemática"),
  row(2, "Anatomia — Sistema nervoso", "Medicina"),
  row(3, "Química Orgânica — Funções e nomenclatura", "Química"),
  row(4, "Física II — Eletromagnetismo", "Física"),
  row(5, "Programação — Estruturas de dados", "Ciência da Computação"),
  row(6, "Direito Constitucional — Direitos fundamentais", "Direito"),
  row(7, "História do Brasil — Era Vargas", "História"),
  row(8, "Inglês — Phrasal verbs essenciais", "Idiomas"),
];

describe("normalize", () => {
  it("coloca em minúsculas e remove acentos", () => {
    expect(normalize("Cálculo")).toBe("calculo");
    expect(normalize("AÇÃO")).toBe("acao");
  });
});

describe("buildListPage", () => {
  it("usa páginas de 5 registros", () => {
    expect(PAGE_SIZE).toBe(5);
  });

  it("primeira página: 5 itens, total 8, 2 páginas, start 0", () => {
    const result = buildListPage(rows, { q: "", page: 1 });
    expect(result.items).toHaveLength(5);
    expect(result.items[0].id).toBe("1");
    expect(result).toMatchObject({ total: 8, totalAll: 8, page: 1, totalPages: 2, start: 0 });
  });

  it("segunda página: 3 itens, start 5", () => {
    const result = buildListPage(rows, { q: "", page: 2 });
    expect(result.items).toHaveLength(3);
    expect(result).toMatchObject({ page: 2, start: 5 });
  });

  it.each([
    [999, 2],
    [0, 1],
    [-3, 1],
    [Number.NaN, 1],
  ])("ajusta page %s para %s", (page, expected) => {
    expect(buildListPage(rows, { q: "", page }).page).toBe(expected);
  });

  it("busca sem acento e sem diferenciar maiúsculas", () => {
    const result = buildListPage(rows, { q: "calculo", page: 1 });
    expect(result.items.map((r) => r.id)).toEqual(["1"]);
  });

  it("busca também pela pasta", () => {
    const result = buildListPage(rows, { q: "MEDICINA", page: 1 });
    expect(result.items.map((r) => r.id)).toEqual(["2"]);
  });

  it("trata q só com espaços como ausência de filtro", () => {
    expect(buildListPage(rows, { q: "   ", page: 1 }).total).toBe(8);
  });

  it.each(["%", "_", "(", "\\", ".*"])("trata %j como texto literal", (q) => {
    const result = buildListPage(rows, { q, page: 1 });
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("acha texto com caractere especial quando ele existe", () => {
    const withPercent = [...rows, row(9, "Taxa 100% real", "Finanças")];
    expect(buildListPage(withPercent, { q: "100%", page: 1 }).items.map((r) => r.id)).toEqual(["9"]);
  });

  it("totalAll ignora o filtro", () => {
    const result = buildListPage(rows, { q: "zzz", page: 1 });
    expect(result).toMatchObject({ total: 0, totalAll: 8, totalPages: 1, page: 1 });
  });

  it("lista vazia: sem itens, uma página", () => {
    expect(buildListPage([], { q: "", page: 1 })).toEqual({
      items: [],
      total: 0,
      totalAll: 0,
      page: 1,
      totalPages: 1,
      start: 0,
    });
  });
});

describe("parsePageParam", () => {
  it.each([
    [undefined, 1],
    ["2", 2],
    ["abc", 1],
    ["0", 1],
    ["-3", 1],
    ["2.5", 1],
    [["3", "4"], 3],
  ])("%j -> %s", (raw, expected) => {
    expect(parsePageParam(raw)).toBe(expected);
  });
});

describe("buildStudyHref", () => {
  it("omite q e page quando são o padrão", () => {
    expect(buildStudyHref("", 1)).toBe("/estudo");
  });

  it("inclui apenas o que difere do padrão", () => {
    expect(buildStudyHref("calc", 1)).toBe("/estudo?q=calc");
    expect(buildStudyHref("", 2)).toBe("/estudo?page=2");
  });

  it("codifica espaços e mantém a ordem q, page", () => {
    expect(buildStudyHref("a b", 2)).toBe("/estudo?q=a+b&page=2");
  });
});
