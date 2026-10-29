import { describe, expect, it } from "vitest";
import {
  flavorOf,
  folderCrumbs,
  folderKey,
  isInsideFolder,
  joinFolder,
  normalizeFolderPath,
  withTrailingSeparator,
} from "@/features/estudo/folder-path";

describe("flavorOf", () => {
  it.each(["C:\\a", "c:/a", "\\\\srv\\share", "//srv/share"])("%j é win32", (input) => {
    expect(flavorOf(input)).toBe("win32");
  });

  it.each(["/var/sf", "/"])("%j é posix", (input) => {
    expect(flavorOf(input)).toBe("posix");
  });

  it.each(["abc", "\\a", ""])("%j não tem sabor", (input) => {
    expect(flavorOf(input)).toBeNull();
  });

  it("examina o texto aparado", () => {
    expect(flavorOf("  /var/sf  ")).toBe("posix");
    expect(flavorOf("  C:\\a")).toBe("win32");
  });
});

describe("normalizeFolderPath (POSIX)", () => {
  it.each([
    ["/var/sf/ana", "/var/sf/ana"],
    ["/var/sf/ana/", "/var/sf/ana"],
    ["/var//sf///ana", "/var/sf/ana"],
    ["/", "/"],
    ["  /var/sf  ", "/var/sf"],
    ["/" + "a".repeat(259), "/" + "a".repeat(259)],
  ])("aceita %j e devolve o caminho normalizado", (input, path) => {
    expect(normalizeFolderPath(input)).toEqual({ ok: true, path });
  });

  it.each([
    "/var/../etc",
    "/var/./x",
    "/a/b.",
    "/a /b",
    "/a/CON",
    "/a/b:c",
    "/a\\b",
    "/a/\u0000b",
    "//a",
    "///a",
    "var/sf",
  ])("rejeita %j", (input) => {
    expect(normalizeFolderPath(input).ok).toBe(false);
  });

  it("rejeita mais de 260 caracteres", () => {
    expect(normalizeFolderPath("/" + "a".repeat(260))).toEqual({
      ok: false,
      message: "Use no máximo 260 caracteres.",
    });
  });

  it("a mensagem de caminho não absoluto cita os dois sabores", () => {
    expect(normalizeFolderPath("var/sf")).toEqual({
      ok: false,
      message: "Informe um caminho absoluto, como C:\\Estudos\\Cálculo ou /var/estudos/calculo.",
    });
  });
});

describe("folderKey", () => {
  it("POSIX diferencia maiúsculas de minúsculas", () => {
    expect(folderKey("/var/sf/ANA")).not.toBe(folderKey("/var/sf/ana"));
  });

  it("POSIX ignora barra final e barras repetidas", () => {
    expect(folderKey("/var//sf/ana/")).toBe("/var/sf/ana");
  });

  it("Windows ignora maiúsculas e minúsculas", () => {
    expect(folderKey("C:\\S\\ANA")).toBe(folderKey("c:\\s\\ana"));
  });
});

describe("isInsideFolder", () => {
  it.each(["/var/sf/ana", "/var/sf/ana/", "/var/sf/ana/a/b"])("POSIX: %j está dentro de /var/sf/ana", (target) => {
    expect(isInsideFolder("/var/sf/ana", target)).toBe(true);
  });

  it.each(["/var/sf/ANA", "/var/sf/ana2", "/var/sf", "/var/sf/ana/../x", "C:\\S\\ana\\x"])(
    "POSIX: %j não está dentro de /var/sf/ana",
    (target) => {
      expect(isInsideFolder("/var/sf/ana", target)).toBe(false);
    },
  );

  it("a raiz / contém qualquer caminho POSIX", () => {
    expect(isInsideFolder("/", "/a")).toBe(true);
    expect(isInsideFolder("/", "/")).toBe(true);
  });

  it("sabores diferentes nunca se contêm", () => {
    expect(isInsideFolder("C:\\S\\ana", "/var/sf/ana/x")).toBe(false);
  });

  it("Windows continua ignorando a caixa", () => {
    expect(isInsideFolder("C:\\S\\ana", "c:\\s\\ANA\\x")).toBe(true);
    expect(isInsideFolder("C:\\S\\ana", "C:\\S\\ana2")).toBe(false);
    expect(isInsideFolder("C:\\", "C:\\x")).toBe(true);
  });

  it("caminho inválido não está dentro de nada", () => {
    expect(isInsideFolder("abc", "/a")).toBe(false);
    expect(isInsideFolder("/a", "abc")).toBe(false);
  });
});

describe("joinFolder", () => {
  it.each([
    ["/var/sf", "ana", "/var/sf/ana"],
    ["/", "a", "/a"],
    ["C:\\S", "ana", "C:\\S\\ana"],
    ["C:\\", "a", "C:\\a"],
  ])("joinFolder(%j, %j) = %j", (parent, name, expected) => {
    expect(joinFolder(parent, name)).toBe(expected);
  });
});

describe("withTrailingSeparator", () => {
  it.each([
    ["C:\\S", "C:\\S\\"],
    ["C:\\", "C:\\"],
    ["/var", "/var/"],
    ["/", "/"],
  ])("withTrailingSeparator(%j) = %j", (folder, expected) => {
    expect(withTrailingSeparator(folder)).toBe(expected);
  });
});

describe("folderCrumbs", () => {
  it("POSIX com raiz informada começa na raiz", () => {
    expect(folderCrumbs("/var/sf/ana/Cálculo", "/var/sf/ana")).toEqual([
      { label: "/var/sf/ana", path: "/var/sf/ana" },
      { label: "Cálculo", path: "/var/sf/ana/Cálculo" },
    ]);
  });

  it("POSIX sem raiz começa em /", () => {
    expect(folderCrumbs("/var/sf/ana")).toEqual([
      { label: "/", path: "/" },
      { label: "var", path: "/var" },
      { label: "sf", path: "/var/sf" },
      { label: "ana", path: "/var/sf/ana" },
    ]);
  });

  it("Windows com raiz informada", () => {
    expect(folderCrumbs("C:\\S\\ana\\x", "C:\\S\\ana")).toEqual([
      { label: "C:\\S\\ana", path: "C:\\S\\ana" },
      { label: "x", path: "C:\\S\\ana\\x" },
    ]);
  });

  it("Windows sem raiz começa na unidade", () => {
    expect(folderCrumbs("C:\\S\\ana")).toEqual([
      { label: "C:\\", path: "C:\\" },
      { label: "S", path: "C:\\S" },
      { label: "ana", path: "C:\\S\\ana" },
    ]);
  });

  it("UNC começa no compartilhamento", () => {
    expect(folderCrumbs("\\\\srv\\sh\\a")).toEqual([
      { label: "\\\\srv\\sh", path: "\\\\srv\\sh" },
      { label: "a", path: "\\\\srv\\sh\\a" },
    ]);
  });

  it("caminho fora da raiz informada usa a raiz do próprio caminho", () => {
    expect(folderCrumbs("C:\\Outro\\x", "C:\\S\\ana")).toEqual([
      { label: "C:\\", path: "C:\\" },
      { label: "Outro", path: "C:\\Outro" },
      { label: "x", path: "C:\\Outro\\x" },
    ]);
    expect(folderCrumbs("/etc/x", "/var/sf/ana")).toEqual([
      { label: "/", path: "/" },
      { label: "etc", path: "/etc" },
      { label: "x", path: "/etc/x" },
    ]);
  });

  it("a própria raiz vira um único trecho", () => {
    expect(folderCrumbs("/", "/")).toEqual([{ label: "/", path: "/" }]);
    expect(folderCrumbs("C:\\S\\ana", "C:\\S\\ana")).toEqual([{ label: "C:\\S\\ana", path: "C:\\S\\ana" }]);
  });
});
