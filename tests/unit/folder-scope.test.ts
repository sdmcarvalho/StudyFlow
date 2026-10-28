// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureUserRoot, isFolderAllowed, isInsideRoot, userRoot } from "@/features/estudo/folder-scope";

let tmp: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-scope-"));
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("userRoot", () => {
  it("é <STUDYFLOW_BASE_DIR>\\<folderName>", () => {
    vi.stubEnv("STUDYFLOW_BASE_DIR", "D:\\Estudos");
    expect(userRoot({ folderName: "ana" })).toBe("D:\\Estudos\\ana");
  });

  it("sem STUDYFLOW_BASE_DIR usa C:\\StudyFlow", () => {
    vi.stubEnv("STUDYFLOW_BASE_DIR", undefined);
    expect(userRoot({ folderName: "ana" })).toBe("C:\\StudyFlow\\ana");
  });
});

describe("isInsideRoot", () => {
  const root = "C:\\S\\ana";

  it("a própria raiz e as subpastas estão dentro", () => {
    expect(isInsideRoot(root, root)).toBe(true);
    expect(isInsideRoot(root, `${root}\\`)).toBe(true);
    expect(isInsideRoot(root, `${root}\\a\\b`)).toBe(true);
    expect(isInsideRoot(root, "C:/S/ana/a/b")).toBe(true);
  });

  it("segmento .. é inválido, logo está fora", () => {
    expect(isInsideRoot(root, `${root}\\..\\x`)).toBe(false);
    expect(isInsideRoot(root, `${root}\\a\\..\\..\\x`)).toBe(false);
  });

  it("irmã com o mesmo prefixo (ana2) está fora", () => {
    expect(isInsideRoot(root, "C:\\S\\ana2")).toBe(false);
    expect(isInsideRoot(root, "C:\\S\\ana2\\x")).toBe(false);
  });

  it("ignora maiúsculas e minúsculas", () => {
    expect(isInsideRoot(root, "c:\\s\\ANA\\x")).toBe(true);
    expect(isInsideRoot(root, "c:\\s\\ANA")).toBe(true);
  });

  it("pasta pai, outra pasta e outra unidade estão fora", () => {
    expect(isInsideRoot(root, "C:\\S")).toBe(false);
    expect(isInsideRoot(root, "C:\\Outro")).toBe(false);
    expect(isInsideRoot(root, "D:\\S\\ana\\x")).toBe(false);
  });

  it("caminho UNC e caminho relativo estão fora", () => {
    expect(isInsideRoot(root, "\\\\servidor\\S\\ana\\x")).toBe(false);
    expect(isInsideRoot(root, "S\\ana\\x")).toBe(false);
    expect(isInsideRoot(root, "")).toBe(false);
  });

  it("raiz inválida nunca contém nada", () => {
    expect(isInsideRoot("ana", "ana\\x")).toBe(false);
  });

  it("raiz de unidade contém as pastas da unidade", () => {
    expect(isInsideRoot("C:\\", "C:\\x\\y")).toBe(true);
    expect(isInsideRoot("C:\\", "D:\\x")).toBe(false);
  });
});

describe("isFolderAllowed", () => {
  it("aceita a raiz, pasta existente e pasta que ainda não existe dentro da raiz", async () => {
    const root = path.join(tmp, "ok-root");
    await fs.mkdir(path.join(root, "Existe"), { recursive: true });
    expect(await isFolderAllowed(root, root)).toBe(true);
    expect(await isFolderAllowed(root, path.join(root, "Existe"))).toBe(true);
    expect(await isFolderAllowed(root, path.join(root, "Nova", "Sub", "Sub2"))).toBe(true);
  });

  it("aceita quando a própria raiz ainda não existe, sem lançar", async () => {
    const root = path.join(tmp, "nao-existe-ainda", "ana");
    expect(await isFolderAllowed(root, path.join(root, "Calculo"))).toBe(true);
    expect(await isFolderAllowed(root, path.join(tmp, "nao-existe-ainda", "bia"))).toBe(false);
  });

  it("recusa o que está fora da raiz, sem tocar o disco", async () => {
    const root = path.join(tmp, "fora-root");
    await fs.mkdir(root, { recursive: true });
    expect(await isFolderAllowed(root, path.join(tmp, "outra"))).toBe(false);
    expect(await isFolderAllowed(root, `${root}2`)).toBe(false);
    expect(await isFolderAllowed(root, `${root}\\..\\x`)).toBe(false);
  });

  it.skipIf(process.platform !== "win32")("recusa raiz\\link\\sub quando link é uma junção para fora", async () => {
    const root = path.join(tmp, "junction-root");
    const outside = path.join(tmp, "junction-outside");
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(path.join(outside, "sub"), { recursive: true });
    const link = path.join(root, "link");
    await fs.symlink(outside, link, "junction");

    expect(await isFolderAllowed(root, link)).toBe(false);
    expect(await isFolderAllowed(root, path.join(link, "sub"))).toBe(false);
    expect(await isFolderAllowed(root, path.join(link, "ainda-nao-existe"))).toBe(false);
    // Só remove o link (a junção), nunca o conteúdo do alvo; o resto é limpo com a pasta temporária.
    await fs.unlink(link).catch(() => fs.rmdir(link));
  });

  it.skipIf(process.platform !== "win32")("aceita junção que aponta para dentro da própria raiz", async () => {
    const root = path.join(tmp, "junction-inside");
    await fs.mkdir(path.join(root, "real", "sub"), { recursive: true });
    const link = path.join(root, "atalho");
    await fs.symlink(path.join(root, "real"), link, "junction");
    expect(await isFolderAllowed(root, path.join(link, "sub"))).toBe(true);
    await fs.unlink(link).catch(() => fs.rmdir(link));
  });
});

describe("ensureUserRoot", () => {
  it("cria a raiz do usuário e a devolve; chamar de novo não muda nada", async () => {
    vi.stubEnv("STUDYFLOW_BASE_DIR", path.join(tmp, "base-ensure"));
    const root = await ensureUserRoot({ folderName: "ana" });
    expect(root).toBe(path.join(tmp, "base-ensure", "ana"));
    expect((await fs.stat(root)).isDirectory()).toBe(true);
    await fs.writeFile(path.join(root, "nota.txt"), "x");
    expect(await ensureUserRoot({ folderName: "ana" })).toBe(root);
    expect(await fs.readFile(path.join(root, "nota.txt"), "utf8")).toBe("x");
  });
});
