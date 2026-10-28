// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { baseFolder, copyImages, ensureFolder, existingBaseFolderNames, imagesDir } from "@/features/estudo/folders";

let root: string;
let dir: string;
let counter = 0;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-folders-"));
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Uma subpasta nova por teste, dentro da pasta temporária do arquivo. */
async function freshDir() {
  dir = path.join(root, `t${++counter}`);
  await fs.mkdir(dir);
  return dir;
}

async function exists(target: string) {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

describe("ensureFolder", () => {
  it("cria uma pasta aninhada inexistente e devolve true", async () => {
    const target = path.join(await freshDir(), "a", "b", "c");
    expect(await ensureFolder(target)).toBe(true);
    expect((await fs.stat(target)).isDirectory()).toBe(true);
  });

  it("devolve true quando a pasta já existe", async () => {
    const target = await freshDir();
    expect(await ensureFolder(target)).toBe(true);
  });

  it("devolve false, sem lançar, quando o caminho passa por um arquivo comum", async () => {
    const file = path.join(await freshDir(), "arquivo.txt");
    await fs.writeFile(file, "x");
    expect(await ensureFolder(path.join(file, "sub"))).toBe(false);
  });
});

describe("imagesDir", () => {
  it("devolve <pasta>\\imagens", () => {
    expect(imagesDir("C:\\Estudos\\Cálculo")).toBe("C:\\Estudos\\Cálculo\\imagens");
  });
});

describe("copyImages", () => {
  it("copia as imagens de A\\imagens para B\\imagens e mantém os originais", async () => {
    const base = await freshDir();
    const from = path.join(base, "A");
    const to = path.join(base, "B");
    await fs.mkdir(imagesDir(from), { recursive: true });
    await fs.writeFile(path.join(imagesDir(from), "a.png"), "A");
    await fs.writeFile(path.join(imagesDir(from), "b.png"), "B");

    await copyImages(from, to);

    expect(await fs.readFile(path.join(imagesDir(to), "a.png"), "utf8")).toBe("A");
    expect(await fs.readFile(path.join(imagesDir(to), "b.png"), "utf8")).toBe("B");
    expect((await fs.readdir(imagesDir(from))).sort()).toEqual(["a.png", "b.png"]);
  });

  it("não sobrescreve um arquivo que já existe no destino", async () => {
    const base = await freshDir();
    const from = path.join(base, "A");
    const to = path.join(base, "B");
    await fs.mkdir(imagesDir(from), { recursive: true });
    await fs.mkdir(imagesDir(to), { recursive: true });
    await fs.writeFile(path.join(imagesDir(from), "a.png"), "novo");
    await fs.writeFile(path.join(imagesDir(from), "b.png"), "B");
    await fs.writeFile(path.join(imagesDir(to), "a.png"), "existente");

    await copyImages(from, to);

    expect(await fs.readFile(path.join(imagesDir(to), "a.png"), "utf8")).toBe("existente");
    expect(await fs.readFile(path.join(imagesDir(to), "b.png"), "utf8")).toBe("B");
    expect(await fs.readFile(path.join(imagesDir(from), "a.png"), "utf8")).toBe("novo");
  });

  it("não faz nada quando a origem não tem imagens", async () => {
    const base = await freshDir();
    const from = path.join(base, "A");
    const to = path.join(base, "B");
    await fs.mkdir(from);
    await fs.mkdir(to);

    await copyImages(from, to);

    expect(await exists(imagesDir(to))).toBe(false);
  });
});

describe("baseFolder", () => {
  it("devolve C:\\StudyFlow sem STUDYFLOW_BASE_DIR", () => {
    vi.stubEnv("STUDYFLOW_BASE_DIR", undefined);
    expect(baseFolder()).toBe("C:\\StudyFlow");
  });

  it("devolve o valor de STUDYFLOW_BASE_DIR quando definida", () => {
    vi.stubEnv("STUDYFLOW_BASE_DIR", "D:\\Meus Estudos");
    expect(baseFolder()).toBe("D:\\Meus Estudos");
  });
});

describe("existingBaseFolderNames", () => {
  it("lista o que existe direto dentro da pasta base", async () => {
    const base = await freshDir();
    await fs.mkdir(path.join(base, "Ana"));
    await fs.mkdir(path.join(base, "Bia", "sub"), { recursive: true });
    vi.stubEnv("STUDYFLOW_BASE_DIR", base);
    expect((await existingBaseFolderNames()).sort()).toEqual(["Ana", "Bia"]);
  });

  it("pasta base inexistente ou que é um arquivo dá lista vazia, sem erro", async () => {
    const base = await freshDir();
    vi.stubEnv("STUDYFLOW_BASE_DIR", path.join(base, "nao-existe"));
    expect(await existingBaseFolderNames()).toEqual([]);
    const file = path.join(base, "arquivo.txt");
    await fs.writeFile(file, "x");
    vi.stubEnv("STUDYFLOW_BASE_DIR", file);
    expect(await existingBaseFolderNames()).toEqual([]);
  });
});
