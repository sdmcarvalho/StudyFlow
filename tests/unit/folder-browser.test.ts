// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSubfolder, isLocalHost, listDrives, listFolder } from "@/features/estudo/folder-browser";

let base: string;

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-browser-"));
  await fs.mkdir(path.join(base, "Física"));
  await fs.mkdir(path.join(base, "cálculo"));
  await fs.mkdir(path.join(base, "Biologia"));
  await fs.mkdir(path.join(base, "$Recycle.Bin"));
  await fs.mkdir(path.join(base, "System Volume Information"));
  await fs.writeFile(path.join(base, "nota.txt"), "não é pasta");
});

afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

describe("listDrives", () => {
  it("normaliza, remove repetidas e ordena as letras, no formato C:\\", async () => {
    const drives = await listDrives(async () => "S:\\\r\nc:\\\r\nD:\r\nC:\\\r\n\r\n");
    expect(drives).toEqual(["C:\\", "D:\\", "S:\\"]);
  });

  it("ignora linhas que não são unidades", async () => {
    const drives = await listDrives(async () => "Aviso qualquer\r\nC:\\\r\n\\\\servidor\\x\r\n");
    expect(drives).toEqual(["C:\\"]);
  });

  it("falha ao consultar o Windows devolve lista vazia, sem lançar", async () => {
    expect(await listDrives(async () => Promise.reject(new Error("sem powershell")))).toEqual([]);
  });

  it("a consulta padrão encontra a unidade da pasta temporária", async () => {
    expect(await listDrives()).toContain(path.parse(base).root.toUpperCase());
  }, 15000);
});

describe("listFolder com pasta que não responde", () => {
  // Pastas próprias: a leitura travada continua pendente (é o que acontece no disco de verdade).
  it("devolve a mensagem de demora em vez de travar", async () => {
    const result = await listFolder(path.join(base, "Biologia"), { timeoutMs: 50, readdir: () => new Promise(() => {}) });
    expect(result).toEqual({ ok: false, message: "A pasta demorou para responder. Tente de novo." });
  });

  it("pedidos repetidos da mesma pasta travada reaproveitam a leitura pendente", async () => {
    let calls = 0;
    const readdir = () => {
      calls++;
      return new Promise<never>(() => {});
    };
    const target = path.join(base, "Física");
    await Promise.all([listFolder(target, { timeoutMs: 50, readdir }), listFolder(target, { timeoutMs: 50, readdir })]);
    await listFolder(`${target}\\`, { timeoutMs: 50, readdir });
    expect(calls).toBe(1);
  });
});

describe("listFolder", () => {
  it("lista só as subpastas, em ordem alfabética sem diferenciar acento/maiúsculas, sem as de sistema", async () => {
    const result = await listFolder(base);
    expect(result).toEqual({
      ok: true,
      path: base,
      parent: path.win32.dirname(base),
      folders: ["Biologia", "cálculo", "Física"],
    });
  });

  it("aceita barras normais e barra final", async () => {
    const result = await listFolder(`${base.replaceAll("\\", "/")}/`);
    expect(result.ok && result.path).toBe(base);
  });

  it("pasta que não existe sobe até a pasta existente mais próxima", async () => {
    const result = await listFolder(path.join(base, "Física", "Nova", "Mais funda"));
    expect(result.ok && result.path).toBe(path.join(base, "Física"));
  });

  it("um arquivo no caminho também sobe para a pasta que o contém", async () => {
    const result = await listFolder(path.join(base, "nota.txt"));
    expect(result.ok && result.path).toBe(base);
  });

  it("na raiz da unidade o pai é null (volta para a lista de unidades)", async () => {
    const root = path.parse(base).root; // ex.: C:\
    const result = await listFolder(root);
    expect(result.ok && result.path).toBe(root);
    expect(result.ok && result.parent).toBeNull();
  });

  it("unidade inexistente devolve path null (lista de unidades)", async () => {
    // Procura uma letra sem unidade montada.
    let missing = "";
    for (const letter of "QRSTUVWXYZ") {
      try {
        await fs.stat(`${letter}:\\`);
      } catch {
        missing = `${letter}:\\Pasta`;
        break;
      }
    }
    if (!missing) return;
    expect(await listFolder(missing)).toEqual({ ok: true, path: null, parent: null, folders: [] });
  });

  it.each(["Matemática", "..\\fora", "C:\\a\\..\\b", "C:\\con", "C:\\a:b", ""])(
    "caminho inválido %j é recusado com a mensagem do campo",
    async (input) => {
      const result = await listFolder(input);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toMatch(/caminho absoluto|Informe uma pasta/);
    },
  );
});

describe("createSubfolder", () => {
  it("cria a subpasta e devolve o caminho completo", async () => {
    const result = await createSubfolder(base, "Química Orgânica");
    expect(result).toEqual({ ok: true, path: path.join(base, "Química Orgânica") });
    expect((await fs.stat(path.join(base, "Química Orgânica"))).isDirectory()).toBe(true);
  });

  it("não sobrescreve uma pasta que já existe", async () => {
    const result = await createSubfolder(base, "Biologia");
    expect(result).toEqual({ ok: false, message: "Já existe uma pasta com esse nome." });
  });

  it("não cria uma pasta com o nome de um arquivo existente", async () => {
    const result = await createSubfolder(base, "nota.txt");
    expect(result).toEqual({ ok: false, message: "Já existe uma pasta com esse nome." });
  });

  it.each(["", "  ", "a\\b", "a/b", "..", ".", "nome.", "con", "NUL.txt", "a:b", "a?b", "<x>"])(
    "nome inválido %j é recusado sem criar nada",
    async (name) => {
      const before = await fs.readdir(base);
      const result = await createSubfolder(base, name);
      expect(result).toEqual({ ok: false, message: "Use um nome de pasta válido, sem \\ / : * ? \" < > |." });
      expect(await fs.readdir(base)).toEqual(before);
    },
  );

  it("o espaço nas pontas do nome é removido", async () => {
    const result = await createSubfolder(base, "  Geografia  ");
    expect(result).toEqual({ ok: true, path: path.join(base, "Geografia") });
  });

  it("pasta pai inexistente não é criada", async () => {
    const parent = path.join(base, "Não existe");
    const result = await createSubfolder(parent, "Filha");
    expect(result).toEqual({ ok: false, message: "Não foi possível criar a pasta." });
    await expect(fs.stat(parent)).rejects.toThrow();
  });

  it("caminho final acima de 260 caracteres é recusado", async () => {
    const result = await createSubfolder(base, "x".repeat(260 - base.length));
    expect(result).toEqual({ ok: false, message: "Use no máximo 260 caracteres." });
  });

  it("pai inválido é recusado", async () => {
    const result = await createSubfolder("Matemática", "Filha");
    expect(result.ok).toBe(false);
  });
});

describe("isLocalHost", () => {
  it.each([
    "localhost",
    "localhost:3000",
    "127.0.0.1:3000",
    "127.10.0.1",
    "[::1]:3000",
    "10.0.0.5:3000",
    "192.168.10.97:3000",
    "172.16.0.1",
    "172.31.255.255:80",
    "169.254.1.2",
    "meu-pc.local:3000",
  ])("aceita %s", (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  it.each([
    null,
    "",
    "example.com",
    "localhost.example.com",
    "172.32.0.1",
    "8.8.8.8:3000",
    "192.169.0.1",
    "10.0.0.5.evil.com",
    "[2001:db8::1]:3000",
  ])("recusa %s", (host) => {
    expect(isLocalHost(host)).toBe(false);
  });
});
