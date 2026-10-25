import { describe, expect, it } from "vitest";
import { parseStudyRecordInput } from "@/features/estudo/schema";

const valid = { descricao: "Cálculo I", pasta: "Matemática", dataInicial: "2026-08-04" };

describe("parseStudyRecordInput", () => {
  it("aceita entrada válida e aplica trim", () => {
    const result = parseStudyRecordInput({
      descricao: "  Cálculo I  ",
      pasta: " Matemática ",
      dataInicial: "2026-08-04",
    });
    expect(result).toEqual({
      ok: true,
      data: { descricao: "Cálculo I", pasta: "Matemática", dataInicial: "2026-08-04" },
    });
  });

  it.each(["", "   "])("rejeita descrição %j", (descricao) => {
    const result = parseStudyRecordInput({ ...valid, descricao });
    expect(result).toEqual({ ok: false, fieldErrors: { descricao: "Informe uma descrição." } });
  });

  it.each(["", "   "])("rejeita pasta %j", (pasta) => {
    const result = parseStudyRecordInput({ ...valid, pasta });
    expect(result).toEqual({ ok: false, fieldErrors: { pasta: "Informe uma pasta." } });
  });

  it.each(["", "2026-02-30", "04/08/2026"])("rejeita dataInicial %j", (dataInicial) => {
    const result = parseStudyRecordInput({ ...valid, dataInicial });
    expect(result).toEqual({ ok: false, fieldErrors: { dataInicial: "Informe uma data válida." } });
  });

  it("aceita descrição de 80 caracteres e rejeita 81", () => {
    expect(parseStudyRecordInput({ ...valid, descricao: "a".repeat(80) }).ok).toBe(true);
    expect(parseStudyRecordInput({ ...valid, descricao: "a".repeat(81) })).toEqual({
      ok: false,
      fieldErrors: { descricao: "Use no máximo 80 caracteres." },
    });
  });

  it("aceita pasta de 40 caracteres e rejeita 41", () => {
    expect(parseStudyRecordInput({ ...valid, pasta: "a".repeat(40) }).ok).toBe(true);
    expect(parseStudyRecordInput({ ...valid, pasta: "a".repeat(41) })).toEqual({
      ok: false,
      fieldErrors: { pasta: "Use no máximo 40 caracteres." },
    });
  });

  it("reporta o erro de todos os campos inválidos de uma vez", () => {
    const result = parseStudyRecordInput({ descricao: "", pasta: "", dataInicial: "" });
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        descricao: "Informe uma descrição.",
        pasta: "Informe uma pasta.",
        dataInicial: "Informe uma data válida.",
      },
    });
  });

  it.each([null, undefined, 42, "texto", {}])("não lança com entrada %j", (input) => {
    const result = parseStudyRecordInput(input);
    expect(result.ok).toBe(false);
  });
});
