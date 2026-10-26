import { describe, expect, it } from "vitest";
import { parseCardInput } from "@/features/cards/schema";

describe("parseCardInput", () => {
  it("aceita um input válido", () => {
    const result = parseCardInput({ tema: "Tema", pergunta: "Pergunta?", resposta: "Resposta" });
    expect(result).toEqual({ ok: true, data: { tema: "Tema", pergunta: "Pergunta?", resposta: "Resposta" } });
  });

  it("rejeita tema vazio", () => {
    const result = parseCardInput({ tema: "", pergunta: "Pergunta?", resposta: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.tema).toBe("Informe o tema.");
  });

  it("rejeita pergunta vazia", () => {
    const result = parseCardInput({ tema: "Tema", pergunta: "", resposta: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.pergunta).toBe("Informe a pergunta.");
  });

  it("aceita resposta vazia (opcional)", () => {
    const result = parseCardInput({ tema: "Tema", pergunta: "Pergunta?", resposta: "" });
    expect(result).toEqual({ ok: true, data: { tema: "Tema", pergunta: "Pergunta?", resposta: "" } });
  });

  it("rejeita tema com mais de 120 caracteres", () => {
    const result = parseCardInput({ tema: "x".repeat(121), pergunta: "Pergunta?", resposta: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.tema).toContain("120");
  });

  it("rejeita pergunta com mais de 5000 caracteres", () => {
    const result = parseCardInput({ tema: "Tema", pergunta: "x".repeat(5001), resposta: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.pergunta).toContain("5 000");
  });

  it("trim nos campos", () => {
    const result = parseCardInput({ tema: "  Tema  ", pergunta: "  Pergunta?  ", resposta: "  Resposta  " });
    expect(result).toEqual({ ok: true, data: { tema: "Tema", pergunta: "Pergunta?", resposta: "Resposta" } });
  });
});