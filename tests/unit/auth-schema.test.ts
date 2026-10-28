import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  parseChangePasswordInput,
  parseCreateUserInput,
  parseLoginInput,
  parseResetPasswordInput,
} from "@/features/auth/schema";

const valid = { nome: "Ana Souza", email: "ana@x.com", senha: "abc12345" };

describe("parseCreateUserInput", () => {
  it("aceita dados válidos e normaliza o e-mail", () => {
    const result = parseCreateUserInput({ ...valid, email: " Ana@X.com " });
    expect(result).toEqual({ ok: true, data: { nome: "Ana Souza", email: "ana@x.com", senha: "abc12345" } });
  });

  it("recusa senha sem número, sem letra e curta, no campo senha", () => {
    for (const senha of ["abcdefgh", "12345678", "a1"]) {
      const result = parseCreateUserInput({ ...valid, senha });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(Object.keys(result.fieldErrors)).toEqual(["senha"]);
        expect(result.fieldErrors.senha).toBeTruthy();
      }
    }
  });

  it("limita a senha a 72 bytes UTF-8", () => {
    const tooLong = parseCreateUserInput({ ...valid, senha: "a1" + "é".repeat(36) });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.fieldErrors.senha).toBeTruthy();
    expect(parseCreateUserInput({ ...valid, senha: "a1" + "é".repeat(35) }).ok).toBe(true);
  });

  it("recusa nome de 1 caractere e e-mail inválido", () => {
    const result = parseCreateUserInput({ ...valid, nome: "A", email: "nao-e-email" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.nome).toBeTruthy();
      expect(result.fieldErrors.email).toBeTruthy();
    }
  });

  it("entrada que não é objeto devolve erros de campo", () => {
    expect(parseCreateUserInput(null).ok).toBe(false);
  });
});

describe("parseLoginInput", () => {
  it("exige senha apenas não vazia e normaliza o e-mail", () => {
    expect(parseLoginInput({ email: " Ana@X.com ", senha: "x" })).toEqual({
      ok: true,
      data: { email: "ana@x.com", senha: "x" },
    });
  });

  it("mantém o next quando informado", () => {
    const result = parseLoginInput({ email: "ana@x.com", senha: "x", next: "/estudo" });
    expect(result).toEqual({ ok: true, data: { email: "ana@x.com", senha: "x", next: "/estudo" } });
  });

  it("recusa senha vazia e e-mail inválido", () => {
    const result = parseLoginInput({ email: "x", senha: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.email).toBeTruthy();
      expect(result.fieldErrors.senha).toBeTruthy();
    }
  });
});

describe("parseResetPasswordInput", () => {
  it("aplica as regras de senha em novaSenha", () => {
    expect(parseResetPasswordInput({ novaSenha: "abc12345" })).toEqual({ ok: true, data: { novaSenha: "abc12345" } });
    const result = parseResetPasswordInput({ novaSenha: "abcdefgh" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.novaSenha).toBeTruthy();
  });
});

describe("parseChangePasswordInput", () => {
  const base = { senhaAtual: "antiga1234", novaSenha: "abc12345", confirmacao: "abc12345" };

  it("aceita quando a confirmação confere", () => {
    expect(parseChangePasswordInput(base)).toEqual({ ok: true, data: base });
  });

  it("recusa confirmação diferente no campo confirmacao", () => {
    const result = parseChangePasswordInput({ ...base, confirmacao: "outra1234" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.confirmacao).toBeTruthy();
  });

  it("exige a senha atual e aplica as regras na nova", () => {
    const result = parseChangePasswordInput({ senhaAtual: "", novaSenha: "abc", confirmacao: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.senhaAtual).toBeTruthy();
      expect(result.fieldErrors.novaSenha).toBeTruthy();
    }
  });
});

describe("normalizeEmail", () => {
  it("apara e põe em minúsculas", () => {
    expect(normalizeEmail(" Ana@X.com ")).toBe("ana@x.com");
  });
});

describe("limites de tamanho (anti-abuso)", () => {
  it("recusa e-mail com mais de 254 caracteres com mensagem de tamanho", () => {
    const tooLong = `${"a".repeat(250)}@x.com`; // 256
    for (const result of [
      parseLoginInput({ email: tooLong, senha: "x" }),
      parseCreateUserInput({ ...valid, email: tooLong }),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fieldErrors.email).toBe("Use no máximo 254 caracteres.");
    }
  });

  it("254 caracteres passam e 255 não (o tamanho é checado antes de normalizar)", () => {
    const base = `${"a".repeat(60)}@${"b".repeat(60)}.${"c".repeat(60)}.${"d".repeat(60)}.com`;
    const at254 = base + "e".repeat(254 - base.length);
    expect(at254).toHaveLength(254);
    expect(parseLoginInput({ email: at254, senha: "x" }).ok).toBe(true);
    expect(parseCreateUserInput({ ...valid, email: at254 }).ok).toBe(true);
    const result255 = parseLoginInput({ email: at254 + "e", senha: "x" });
    expect(result255.ok).toBe(false);
    if (!result255.ok) expect(result255.fieldErrors.email).toBe("Use no máximo 254 caracteres.");
    // espaços ao redor contam: o limite protege antes da normalização
    const padded = parseLoginInput({ email: ` ${at254}`, senha: "x" });
    expect(padded.ok).toBe(false);
  });

  it("senha do login: 1024 caracteres passam e 1025 são recusados", () => {
    expect(parseLoginInput({ email: "ana@x.com", senha: "x".repeat(1024) }).ok).toBe(true);
    const result = parseLoginInput({ email: "ana@x.com", senha: "x".repeat(1025) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.senha).toBe("Use no máximo 1024 caracteres.");
  });
});
