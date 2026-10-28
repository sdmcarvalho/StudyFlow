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

  it("aceita fallback customizado", () => {
    expect(safeNext("//evil.com", "/")).toBe("/");
  });
});
