import { describe, expect, it } from "vitest";
import { safeNext } from "@/features/auth/next-url";

describe("safeNext", () => {
  it("mantém caminhos internos", () => {
    expect(safeNext("/estudo?page=2")).toBe("/estudo?page=2");
  });

  it("cai no fallback para valores inseguros ou inválidos", () => {
    const unsafe: unknown[] = ["//evil.com", "https://x.com", "/\\evil.com", "", undefined, "/login", "/login?next=/x", 42];
    for (const value of unsafe) {
      expect(safeNext(value)).toBe("/estudo");
    }
  });

  it("mantém caminho, query e subcaminhos como estão", () => {
    expect(safeNext("/estudo")).toBe("/estudo");
    expect(safeNext("/estudo/abc?x=1&y=2")).toBe("/estudo/abc?x=1&y=2");
    expect(safeNext("/")).toBe("/");
  });

  it("rejeita formas que só viram perigosas depois de canonizadas", () => {
    const unsafe = [
      "/.//evil.com",
      "/estudo/../login",
      "/estudo/../../login",
      "/%2e%2e//evil.com",
      "/%2E%2E/%2e%2e//evil.com",
      "/./login",
      "/LOGIN",
      "/a/..//evil.com",
      "/estudo/..",
    ];
    for (const value of unsafe) {
      const result = safeNext(value);
      expect(result, value).not.toMatch(/^\/\//);
      expect(result.toLowerCase().startsWith("/login"), value).toBe(false);
    }
    for (const value of ["/.//evil.com", "/estudo/../login", "/a/..//evil.com", "/./login"]) {
      expect(safeNext(value), value).toBe("/estudo");
    }
  });

  it("rejeita valores com mais de 2048 caracteres", () => {
    expect(safeNext(`/${"a".repeat(2047)}`)).toBe(`/${"a".repeat(2047)}`);
    expect(safeNext(`/${"a".repeat(2048)}`)).toBe("/estudo");
  });

  it("aceita fallback customizado", () => {
    expect(safeNext("//evil.com", "/")).toBe("/");
  });
});
