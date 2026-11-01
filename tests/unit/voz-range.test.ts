import { describe, expect, it } from "vitest";
import {
  MSG_FEW_CELLS,
  adjustEnd,
  audioFileName,
  defaultRange,
  validateRange,
} from "@/features/voz/range";

const NOT_INT = "Use um número inteiro.";

describe("validateRange", () => {
  it("aceita números válidos", () => {
    expect(validateRange(3, 10, 10)).toEqual({ ok: true, start: 3, end: 10 });
    expect(validateRange(1, 2, 10)).toEqual({ ok: true, start: 1, end: 2 });
    expect(validateRange(9, 10, 10)).toEqual({ ok: true, start: 9, end: 10 });
  });

  it("aceita texto com inteiro e ignora espaços nas pontas", () => {
    expect(validateRange("  3 ", "7", 10)).toEqual({ ok: true, start: 3, end: 7 });
    expect(validateRange("01", "02", 10)).toEqual({ ok: true, start: 1, end: 2 });
  });

  it("estudo com 2 células aceita 1 e 2", () => {
    expect(validateRange("1", "2", 2)).toEqual({ ok: true, start: 1, end: 2 });
  });

  it("vazio pede o campo", () => {
    const r = validateRange("", "  ", 10);
    expect(r).toEqual({
      ok: false,
      errors: { start: "Informe a célula inicial.", end: "Informe a célula final." },
    });
  });

  it("undefined e null contam como vazio", () => {
    expect(validateRange(undefined, null, 10)).toEqual({
      ok: false,
      errors: { start: "Informe a célula inicial.", end: "Informe a célula final." },
    });
  });

  it.each(["abc", "2.5", "-1", "1e2", "1,5", "+3", "0x10", "1 2", "٣"])(
    "texto %j não é inteiro",
    (v) => {
      const r = validateRange(v, 5, 10);
      expect(r).toEqual({ ok: false, errors: { start: NOT_INT } });
      const r2 = validateRange(2, v, 10);
      expect(r2).toEqual({ ok: false, errors: { end: NOT_INT } });
    },
  );

  it("números não inteiros ou inválidos dão 'Use um número inteiro.'", () => {
    expect(validateRange(2.5, 5, 10)).toEqual({ ok: false, errors: { start: NOT_INT } });
    expect(validateRange(NaN, 5, 10)).toEqual({ ok: false, errors: { start: NOT_INT } });
    expect(validateRange(2, Infinity, 10)).toEqual({ ok: false, errors: { end: NOT_INT } });
    expect(validateRange({}, 5, 10)).toEqual({ ok: false, errors: { start: NOT_INT } });
    expect(validateRange(true, 5, 10)).toEqual({ ok: false, errors: { start: NOT_INT } });
  });

  it("inicial fora da faixa 1..N-1", () => {
    const msg = "A célula inicial deve estar entre 1 e 9.";
    expect(validateRange(0, 10, 10)).toEqual({ ok: false, errors: { start: msg } });
    expect(validateRange("0", "10", 10)).toEqual({ ok: false, errors: { start: msg } });
    expect(validateRange(10, 10, 10)).toEqual({ ok: false, errors: { start: msg, end: undefined } });
    expect(validateRange(-1, 5, 10)).toEqual({ ok: false, errors: { start: msg } });
    expect(validateRange(11, 12, 10)).toMatchObject({ ok: false, errors: { start: msg } });
  });

  it("final fora da faixa inicial+1..N", () => {
    expect(validateRange(3, 3, 10)).toEqual({
      ok: false,
      errors: { end: "A célula final deve estar entre 4 e 10." },
    });
    expect(validateRange(3, 2, 10)).toEqual({
      ok: false,
      errors: { end: "A célula final deve estar entre 4 e 10." },
    });
    expect(validateRange(3, 11, 10)).toEqual({
      ok: false,
      errors: { end: "A célula final deve estar entre 4 e 10." },
    });
    expect(validateRange("3", "0", 10)).toEqual({
      ok: false,
      errors: { end: "A célula final deve estar entre 4 e 10." },
    });
  });

  it("com inicial inválida a final é conferida contra 2..N", () => {
    const r = validateRange(0, 11, 10);
    expect(r).toEqual({
      ok: false,
      errors: {
        start: "A célula inicial deve estar entre 1 e 9.",
        end: "A célula final deve estar entre 2 e 10.",
      },
    });
  });

  it("números enormes não passam", () => {
    const big = "9".repeat(400);
    expect(validateRange(big, "5", 10)).toMatchObject({ ok: false });
    expect(validateRange("1", big, 10)).toMatchObject({
      ok: false,
      errors: { end: "A célula final deve estar entre 2 e 10." },
    });
  });

  it("menos de 2 células: ambos os campos recebem a mensagem", () => {
    for (const total of [0, 1]) {
      expect(validateRange(1, 2, total)).toEqual({
        ok: false,
        errors: { start: MSG_FEW_CELLS, end: MSG_FEW_CELLS },
      });
      expect(validateRange("", "", total)).toEqual({
        ok: false,
        errors: { start: MSG_FEW_CELLS, end: MSG_FEW_CELLS },
      });
    }
    expect(MSG_FEW_CELLS).toBe("O estudo precisa de pelo menos 2 células para usar a Voz.");
  });
});

describe("defaultRange", () => {
  it("vai de 1 até o total", () => {
    expect(defaultRange(7)).toEqual({ start: 1, end: 7 });
    expect(defaultRange(2)).toEqual({ start: 1, end: 2 });
  });
});

describe("adjustEnd", () => {
  it("mantém a final quando ainda é maior que a inicial", () => {
    expect(adjustEnd(2, 8, 10)).toBe(8);
  });
  it("reajusta para inicial+1 quando a final fica <= inicial", () => {
    expect(adjustEnd(5, 3, 10)).toBe(6);
    expect(adjustEnd(5, 5, 10)).toBe(6);
  });
  it("não passa do total", () => {
    expect(adjustEnd(9, 2, 10)).toBe(10);
    expect(adjustEnd(10, 2, 10)).toBe(10);
  });
});

describe("audioFileName", () => {
  it("monta '<Descrição> - células X a Y.mp3'", () => {
    expect(audioFileName("Aula 1", 3, 10)).toBe("Aula 1 - células 3 a 10.mp3");
  });

  it("troca caracteres inválidos de nome de arquivo por '-'", () => {
    expect(audioFileName("Aula: C/C++?", 3, 10)).toBe("Aula- C-C++- - células 3 a 10.mp3");
    expect(audioFileName('a\\b/c:d*e?f"g<h>i|j', 1, 2)).toBe("a-b-c-d-e-f-g-h-i-j - células 1 a 2.mp3");
  });

  it("troca caracteres de controle (inclusive \\0 e quebras de linha) por '-'", () => {
    expect(audioFileName("a\0b\nc\td", 1, 2)).toBe("a-b-c-d - células 1 a 2.mp3");
  });

  it("trunca a descrição em 80 caracteres antes de compor", () => {
    const name = audioFileName("x".repeat(200), 1, 2);
    expect(name).toBe(`${"x".repeat(80)} - células 1 a 2.mp3`);
  });

  it("descrição vazia ou só espaços vira 'Voz'", () => {
    expect(audioFileName("", 1, 2)).toBe("Voz - células 1 a 2.mp3");
    expect(audioFileName("   \t ", 1, 2)).toBe("Voz - células 1 a 2.mp3");
  });

  it("apara espaços nas pontas", () => {
    expect(audioFileName("  Aula  ", 1, 2)).toBe("Aula - células 1 a 2.mp3");
  });
});
