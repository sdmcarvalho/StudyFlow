import { describe, expect, it } from "vitest";
import {
  MAX_CELLS,
  MAX_CELL_CHARS,
  MAX_CONTENT_BYTES,
  parseContent,
  parseStoredContent,
  serializeContent,
  type Cell,
} from "@/features/estudo/content-schema";

function cells(count: number, texto = "a"): Cell[] {
  return Array.from({ length: count }, (_, i) => ({ id: `c${i}`, texto }));
}

describe("limites", () => {
  it("expõe os limites da spec", () => {
    expect(MAX_CELLS).toBe(500);
    expect(MAX_CELL_CHARS).toBe(200_000);
    expect(MAX_CONTENT_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe("parseContent", () => {
  it("aceita uma lista válida de 2 células", () => {
    const list = [
      { id: "a", texto: "um" },
      { id: "b", texto: "dois" },
    ];
    expect(parseContent(list)).toEqual({ ok: true, cells: list });
  });

  it("500 células passam e 501 falham", () => {
    expect(parseContent(cells(500)).ok).toBe(true);
    expect(parseContent(cells(501))).toEqual({ ok: false });
  });

  it("texto de 200 000 caracteres passa e de 200 001 falha", () => {
    expect(parseContent([{ id: "a", texto: "x".repeat(200_000) }]).ok).toBe(true);
    expect(parseContent([{ id: "a", texto: "x".repeat(200_001) }])).toEqual({ ok: false });
  });

  it("id vazio, com 65 caracteres ou repetido falham; 64 caracteres passa", () => {
    expect(parseContent([{ id: "", texto: "a" }])).toEqual({ ok: false });
    expect(parseContent([{ id: "i".repeat(65), texto: "a" }])).toEqual({ ok: false });
    expect(parseContent([{ id: "i".repeat(64), texto: "a" }]).ok).toBe(true);
    expect(
      parseContent([
        { id: "a", texto: "1" },
        { id: "a", texto: "2" },
      ]),
    ).toEqual({ ok: false });
  });

  it("JSON total acima de 5 MB falha", () => {
    // 30 células de 190 000 caracteres = 5,7 MB, cada uma dentro do limite individual.
    const big = cells(30, "x".repeat(190_000));
    expect(JSON.stringify(big).length).toBeGreaterThan(MAX_CONTENT_BYTES);
    expect(parseContent(big)).toEqual({ ok: false });
  });

  it("conta bytes, não caracteres, no limite de 5 MB", () => {
    // 27 células de 100 000 "ã" (2 bytes cada em UTF-8): 5,4 MB em bytes, 2,7 M caracteres.
    const big = cells(27, "ã".repeat(100_000));
    expect(JSON.stringify(big).length).toBeLessThan(MAX_CONTENT_BYTES);
    expect(parseContent(big)).toEqual({ ok: false });
  });

  it("entradas que não são uma lista de células válidas devolvem { ok: false } sem lançar", () => {
    for (const raw of [null, undefined, {}, "x", 42, [1], [{ id: 1, texto: "a" }], [{ id: "a" }], [{ id: "a", texto: 1 }]]) {
      expect(parseContent(raw)).toEqual({ ok: false });
    }
  });

  it("descarta campos extras das células", () => {
    const result = parseContent([{ id: "a", texto: "t", extra: "x" }]);
    expect(result).toEqual({ ok: true, cells: [{ id: "a", texto: "t" }] });
  });
});

describe("parseStoredContent e serializeContent", () => {
  it("JSON inválido ou fora das regras devolve [] sem lançar", () => {
    expect(parseStoredContent("")).toEqual([]);
    expect(parseStoredContent("{")).toEqual([]);
    expect(parseStoredContent("[1]")).toEqual([]);
    expect(parseStoredContent('{"id":"a","texto":"b"}')).toEqual([]);
  });

  it("serializar e ler devolve as mesmas células, na mesma ordem", () => {
    const list = [
      { id: "b", texto: "segundo\ncom quebra" },
      { id: "a", texto: "primeiro ã" },
    ];
    expect(parseStoredContent(serializeContent(list))).toEqual(list);
  });

  it("'[]' devolve lista vazia", () => {
    expect(parseStoredContent("[]")).toEqual([]);
  });
});
