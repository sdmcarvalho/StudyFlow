import { describe, expect, it } from "vitest";
import { folderKey, MAX_FOLDER_CHARS, normalizeFolderPath } from "@/features/estudo/folder-path";

const ABSOLUTE_MESSAGE = "Informe um caminho absoluto, como C:\\Estudos\\Cálculo.";

describe("normalizeFolderPath", () => {
  it.each([
    ["C:\\Estudos\\Cálculo", "C:\\Estudos\\Cálculo"],
    ["c:/Estudos/Cálculo", "c:\\Estudos\\Cálculo"],
    ["C:\\Estudos\\Cálculo\\", "C:\\Estudos\\Cálculo"],
    ["D:\\", "D:\\"],
    ["D:/", "D:\\"],
    ["\\\\servidor\\pasta\\sub", "\\\\servidor\\pasta\\sub"],
    ["\\\\servidor\\pasta\\", "\\\\servidor\\pasta"],
  ])("aceita %j e devolve %j", (input, path) => {
    expect(normalizeFolderPath(input)).toEqual({ ok: true, path });
  });

  it.each([
    "Matemática",
    "Estudos\\Cálculo",
    ".\\x",
    "C:Estudos",
    "C:\\a\\..\\b",
    "C:\\..",
    "\\\\servidor",
    "\\\\\\\\",
    "C:\\a\\\\b",
  ])("rejeita %j como caminho não absoluto", (input) => {
    expect(normalizeFolderPath(input)).toEqual({ ok: false, message: ABSOLUTE_MESSAGE });
  });

  it("aceita 260 caracteres e rejeita 261", () => {
    expect(MAX_FOLDER_CHARS).toBe(260);
    const prefix = "C:\\";
    expect(normalizeFolderPath(prefix + "a".repeat(260 - prefix.length)).ok).toBe(true);
    expect(normalizeFolderPath(prefix + "a".repeat(261 - prefix.length))).toEqual({
      ok: false,
      message: "Use no máximo 260 caracteres.",
    });
  });

  it("remove espaços nas pontas", () => {
    expect(normalizeFolderPath("  C:\\Estudos  ")).toEqual({ ok: true, path: "C:\\Estudos" });
  });

  it.each(["", "   "])("pede uma pasta quando a entrada é %j", (input) => {
    expect(normalizeFolderPath(input)).toEqual({ ok: false, message: "Informe uma pasta." });
  });
});

describe("folderKey", () => {
  it("ignora barra final, tipo de barra e caixa", () => {
    expect(folderKey("C:\\A\\")).toBe(folderKey("c:/a"));
    expect(folderKey("C:\\A\\")).toBe("c:\\a");
  });
});
