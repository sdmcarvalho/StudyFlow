// @vitest-environment node
// Servidor ciente do sabor do caminho (Windows ou POSIX). O disco é simulado: roda igual no Windows e no Linux.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => {
  const existing: Record<string, string> = {};
  const enoent = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const realpath = vi.fn(async (target: string) => {
    if (target in existing) return existing[target];
    throw enoent();
  });
  const mkdir = vi.fn(async () => undefined);
  const stat = vi.fn(async () => {
    throw enoent();
  });
  const readdir = vi.fn(async () => {
    throw enoent();
  });
  return { existing, realpath, mkdir, stat, readdir };
});

vi.mock("node:fs/promises", () => {
  const api = {
    realpath: fsMock.realpath,
    mkdir: fsMock.mkdir,
    stat: fsMock.stat,
    readdir: fsMock.readdir,
  };
  return { default: api, ...api };
});

import { createSubfolder, listDrives, parentOf } from "@/features/estudo/folder-browser";
import { isFolderAllowed, userRoot } from "@/features/estudo/folder-scope";
import { baseFolder, copyImages, ensureFolder, imagesDir } from "@/features/estudo/folders";
import { isForeignPath, pathApi, platformFlavor } from "@/features/estudo/path-api";
import path from "node:path";

const INVALID_NAME = 'Use um nome de pasta válido, sem \\ / : * ? " < > |.';

beforeEach(() => {
  for (const key of Object.keys(fsMock.existing)) delete fsMock.existing[key];
  fsMock.realpath.mockClear();
  fsMock.mkdir.mockClear();
  fsMock.stat.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pathApi e platformFlavor", () => {
  it("pathApi devolve a API de caminhos do sabor", () => {
    expect(pathApi("win32")).toBe(path.win32);
    expect(pathApi("posix")).toBe(path.posix);
  });

  it("platformFlavor: win32 no Windows, posix nas demais plataformas", () => {
    expect(platformFlavor("win32")).toBe("win32");
    expect(platformFlavor("linux")).toBe("posix");
    expect(platformFlavor("darwin")).toBe("posix");
  });
});

describe("baseFolder com plataforma", () => {
  it("lança citando STUDYFLOW_BASE_DIR quando o sabor da variável difere da plataforma", () => {
    vi.stubEnv("STUDYFLOW_BASE_DIR", "C:\\Estudos");
    expect(() => baseFolder("linux")).toThrow(/STUDYFLOW_BASE_DIR/);
    vi.stubEnv("STUDYFLOW_BASE_DIR", "/var/sf");
    expect(() => baseFolder("win32")).toThrow(/STUDYFLOW_BASE_DIR/);
  });

  it("sem a variável usa o padrão da plataforma", () => {
    vi.stubEnv("STUDYFLOW_BASE_DIR", undefined);
    expect(baseFolder("linux")).toBe("/var/lib/studyflow");
    expect(baseFolder("win32")).toBe("C:\\StudyFlow");
  });

  it("normaliza o valor POSIX no Linux", () => {
    vi.stubEnv("STUDYFLOW_BASE_DIR", "/var/sf/");
    expect(baseFolder("linux")).toBe("/var/sf");
  });

  it("valor sem sabor (inválido) continua devolvendo o texto cru", () => {
    vi.stubEnv("STUDYFLOW_BASE_DIR", "relativa");
    expect(baseFolder("linux")).toBe("relativa");
    expect(baseFolder("win32")).toBe("relativa");
  });
});

describe("userRoot POSIX", () => {
  it("junta a base POSIX com o folderName usando /", () => {
    expect(userRoot({ folderName: "ana" }, "/var/lib/studyflow")).toBe("/var/lib/studyflow/ana");
  });
});

describe("isFolderAllowed POSIX", () => {
  it("aceita subpasta que ainda não existe dentro da raiz existente", async () => {
    fsMock.existing["/var/sf/ana"] = "/var/sf/ana";
    expect(await isFolderAllowed("/var/sf/ana", "/var/sf/ana/a")).toBe(true);
  });

  it("recusa link simbólico dentro da raiz que aponta para fora", async () => {
    fsMock.existing["/var/sf/ana"] = "/var/sf/ana";
    fsMock.existing["/var/sf/ana/link"] = "/etc";
    expect(await isFolderAllowed("/var/sf/ana", "/var/sf/ana/link")).toBe(false);
  });

  it("diferencia maiúsculas: /var/sf/ANA não está em /var/sf/ana, sem tocar o disco", async () => {
    expect(await isFolderAllowed("/var/sf/ana", "/var/sf/ANA/x")).toBe(false);
    expect(fsMock.realpath).not.toHaveBeenCalled();
  });

  it("caminho de outro sabor é recusado antes do disco", async () => {
    expect(await isFolderAllowed("/var/sf/ana", "C:\\x")).toBe(false);
    expect(await isFolderAllowed("C:\\S\\ana", "/var/sf/ana/x")).toBe(false);
    expect(fsMock.realpath).not.toHaveBeenCalled();
  });
});

describe("imagesDir com sabor", () => {
  it("usa o separador da pasta", () => {
    expect(imagesDir("/var/sf/ana/x")).toBe("/var/sf/ana/x/imagens");
    expect(imagesDir("C:\\S\\x")).toBe("C:\\S\\x\\imagens");
  });
});

describe("parentOf", () => {
  it.each([
    ["/", null],
    ["/a", "/"],
    ["/a/b", "/a"],
    ["C:\\", null],
    ["C:\\a", "C:\\"],
    ["\\\\srv\\sh", null],
  ])("pai de %j é %j", (folder, parent) => {
    expect(parentOf(folder)).toBe(parent);
  });
});

describe("listDrives fora do Windows", () => {
  it("devolve [] sem consultar o sistema", async () => {
    const query = vi.fn(async () => "C:\\\r\n");
    expect(await listDrives(query, "linux")).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("createSubfolder POSIX", () => {
  it("cria com / e devolve o caminho completo", async () => {
    expect(await createSubfolder("/var/sf/ana", "x")).toEqual({ ok: true, path: "/var/sf/ana/x" });
    expect(fsMock.mkdir).toHaveBeenCalledWith("/var/sf/ana/x");
  });

  it.each(["a/b", "a\\b"])("nome %j é recusado sem criar nada", async (name) => {
    expect(await createSubfolder("/var/sf/ana", name)).toEqual({ ok: false, message: INVALID_NAME });
    expect(fsMock.mkdir).not.toHaveBeenCalled();
  });
});

describe("isForeignPath", () => {
  it("sabor conhecido diferente do da plataforma", () => {
    expect(isForeignPath("/var/sf", "win32")).toBe(true);
    expect(isForeignPath("C:\\S", "linux")).toBe(true);
    expect(isForeignPath("\\\\srv\\sh", "linux")).toBe(true);
    expect(isForeignPath("C:\\S", "win32")).toBe(false);
    expect(isForeignPath("/var/sf", "linux")).toBe(false);
    expect(isForeignPath("relativa", "win32")).toBe(false);
  });
});

describe("disco recusa caminho de outro sabor que o da plataforma", () => {
  const foreign = platformFlavor() === "win32" ? "/var/sf/ana/x" : "C:\\S\\ana\\x";
  const native = platformFlavor() === "win32" ? "C:\\S\\ana\\y" : "/var/sf/ana/y";

  it("ensureFolder devolve false sem tocar o disco", async () => {
    expect(await ensureFolder(foreign)).toBe(false);
    expect(fsMock.mkdir).not.toHaveBeenCalled();
    expect(fsMock.stat).not.toHaveBeenCalled();
  });

  it("copyImages não lê a origem nem cria o destino", async () => {
    fsMock.readdir.mockClear();
    await copyImages(foreign, native);
    await copyImages(native, foreign);
    expect(fsMock.readdir).not.toHaveBeenCalled();
    expect(fsMock.mkdir).not.toHaveBeenCalled();
  });
});
