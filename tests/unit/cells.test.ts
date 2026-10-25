import { describe, expect, it } from "vitest";

import type { Cell } from "@/features/estudo/content-schema";
import {
  addCellAfter,
  ensureAtLeastOne,
  moveCell,
  newCellId,
  removeCell,
  restoreCell,
  updateCellText,
} from "@/features/estudo/editor/cells";

function cells(...ids: string[]): Cell[] {
  return ids.map((id) => ({ id, texto: `texto ${id}` }));
}

function ids(list: Cell[]): string[] {
  return list.map((cell) => cell.id);
}

describe("newCellId", () => {
  it("gera ids únicos e não vazios", () => {
    const a = newCellId();
    const b = newCellId();
    expect(a).not.toBe("");
    expect(a).not.toBe(b);
  });
});

describe("ensureAtLeastOne", () => {
  it("transforma lista vazia em uma célula vazia", () => {
    const result = ensureAtLeastOne([], "novo");
    expect(result).toEqual([{ id: "novo", texto: "" }]);
  });

  it("gera um id quando não é informado", () => {
    const result = ensureAtLeastOne([]);
    expect(result).toHaveLength(1);
    expect(result[0].texto).toBe("");
    expect(result[0].id).not.toBe("");
  });

  it("devolve a lista igual quando já tem itens", () => {
    const list = cells("a", "b");
    expect(ensureAtLeastOne(list, "novo")).toEqual(list);
  });
});

describe("addCellAfter", () => {
  it("insere logo depois do id dado", () => {
    const result = addCellAfter(cells("a", "b", "c"), "a", "x");
    expect(ids(result)).toEqual(["a", "x", "b", "c"]);
    expect(result[1]).toEqual({ id: "x", texto: "" });
  });

  it("insere depois da última", () => {
    expect(ids(addCellAfter(cells("a", "b"), "b", "x"))).toEqual(["a", "b", "x"]);
  });

  it("adiciona no fim quando o id não existe", () => {
    expect(ids(addCellAfter(cells("a", "b"), "zzz", "x"))).toEqual(["a", "b", "x"]);
  });

  it("não muta o array original", () => {
    const list = cells("a", "b");
    const snapshot = structuredClone(list);
    addCellAfter(list, "a", "x");
    expect(list).toEqual(snapshot);
  });
});

describe("removeCell", () => {
  it("remove do meio e informa célula e índice", () => {
    const list = cells("a", "b", "c");
    const { cells: result, removed } = removeCell(list, "b", "novo");
    expect(ids(result)).toEqual(["a", "c"]);
    expect(removed).toEqual({ cell: { id: "b", texto: "texto b" }, index: 1 });
    expect(ids(list)).toEqual(["a", "b", "c"]);
  });

  it("remover a última célula restante deixa uma célula vazia com o newId", () => {
    const { cells: result, removed } = removeCell(cells("a"), "a", "novo");
    expect(result).toEqual([{ id: "novo", texto: "" }]);
    expect(removed).toEqual({ cell: { id: "a", texto: "texto a" }, index: 0 });
  });

  it("id inexistente devolve removed null e a lista igual", () => {
    const list = cells("a", "b");
    const { cells: result, removed } = removeCell(list, "zzz", "novo");
    expect(removed).toBeNull();
    expect(result).toEqual(list);
  });
});

describe("restoreCell", () => {
  it("devolve a célula à posição original", () => {
    const result = restoreCell(cells("a", "c"), {
      cell: { id: "b", texto: "texto b" },
      index: 1,
    });
    expect(ids(result)).toEqual(["a", "b", "c"]);
  });

  it("coloca no fim quando o índice passa do tamanho", () => {
    const result = restoreCell(cells("a"), {
      cell: { id: "b", texto: "texto b" },
      index: 9,
    });
    expect(ids(result)).toEqual(["a", "b"]);
  });

  it("não muta o array original", () => {
    const list = cells("a", "c");
    restoreCell(list, { cell: { id: "b", texto: "" }, index: 1 });
    expect(ids(list)).toEqual(["a", "c"]);
  });
});

describe("moveCell", () => {
  it("move do início para o fim", () => {
    expect(ids(moveCell(cells("a", "b", "c"), 0, 2))).toEqual(["b", "c", "a"]);
  });

  it("move do fim para o início", () => {
    expect(ids(moveCell(cells("a", "b", "c"), 2, 0))).toEqual(["c", "a", "b"]);
  });

  it("devolve a lista igual para índices iguais ou fora do intervalo", () => {
    const list = cells("a", "b", "c");
    expect(moveCell(list, 1, 1)).toEqual(list);
    expect(moveCell(list, -1, 1)).toEqual(list);
    expect(moveCell(list, 0, 3)).toEqual(list);
    expect(moveCell(list, 3, 0)).toEqual(list);
  });

  it("não muta o array original", () => {
    const list = cells("a", "b", "c");
    moveCell(list, 0, 2);
    expect(ids(list)).toEqual(["a", "b", "c"]);
  });
});

describe("updateCellText", () => {
  it("altera só a célula do id", () => {
    const list = cells("a", "b");
    const result = updateCellText(list, "b", "novo texto");
    expect(result).toEqual([
      { id: "a", texto: "texto a" },
      { id: "b", texto: "novo texto" },
    ]);
    expect(list[1].texto).toBe("texto b");
  });

  it("id inexistente não altera nada", () => {
    const list = cells("a", "b");
    expect(updateCellText(list, "zzz", "x")).toEqual(list);
  });
});
