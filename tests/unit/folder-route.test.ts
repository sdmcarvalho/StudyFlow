// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/next-headers"));

import { GET, POST } from "@/app/api/pastas/route";
import { userRoot } from "@/features/estudo/folder-scope";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

// `tmp` é a STUDYFLOW_BASE_DIR deste arquivo; `base` é a raiz do usuário logado (o seletor não sai dela).
let tmp: string;
let base: string;
let user: Awaited<ReturnType<typeof createTestUser>>;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-pastas-"));
  vi.stubEnv("STUDYFLOW_BASE_DIR", tmp);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await fs.rm(tmp, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.studyRecord.deleteMany();
  await db.aiSettings.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  signOut();
  user = await createTestUser();
  await signInAs(user);
  base = userRoot(user);
  await fs.rm(base, { recursive: true, force: true });
  await fs.mkdir(path.join(base, "Física"), { recursive: true });
});

const LOCAL = "localhost:3000";
const FORBIDDEN = "O seletor de pastas só funciona neste computador ou na rede local.";

function get(caminho: string | null, host: string | null = LOCAL) {
  const url = new URL("http://localhost:3000/api/pastas");
  if (caminho !== null) url.searchParams.set("caminho", caminho);
  const headers = new Headers();
  if (host !== null) headers.set("host", host);
  return GET(new Request(url, { headers }));
}

function post(body: unknown, options: { host?: string; origin?: string; contentType?: string } = {}) {
  const headers = new Headers({ host: options.host ?? LOCAL, "content-type": options.contentType ?? "application/json" });
  if (options.origin) headers.set("origin", options.origin);
  return POST(
    new Request("http://localhost:3000/api/pastas", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("GET /api/pastas", () => {
  it("lista as subpastas da raiz do usuário, sem unidades e sem pasta acima", async () => {
    const response = await get(base);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.path).toBe(base);
    expect(json.folders).toEqual(["Física"]);
    expect(json.parent).toBeNull();
    expect(json.drives).toEqual([]);
  });

  it("sem caminho (ou vazio) devolve a raiz do usuário, criando-a se preciso", async () => {
    await fs.rm(base, { recursive: true, force: true });
    for (const caminho of [null, "", "  "]) {
      const response = await get(caminho);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ path: base, parent: null, folders: [], drives: [] });
    }
    expect((await fs.stat(base)).isDirectory()).toBe(true);
  });

  it("subpasta devolve a raiz como pasta acima e continua sem unidades", async () => {
    const json = await (await get(path.join(base, "Física"))).json();
    expect(json.path).toBe(path.join(base, "Física"));
    expect(json.parent).toBe(base);
    expect(json.drives).toEqual([]);
  });

  it("segmento .. no caminho é recusado (400) e nunca lista fora da raiz", async () => {
    const response = await get(`${base}\\..\\alheia`);
    expect(response.status).toBe(400);
    expect((await response.json()).folders).toBeUndefined();
  });

  it("pasta que não existe dentro da raiz sobe até a mais próxima que existe", async () => {
    const json = await (await get(path.join(base, "Física", "Nada"))).json();
    expect(json.path).toBe(path.join(base, "Física"));
  });

  it("sem sessão devolve 401 e não cria a raiz", async () => {
    signOut();
    await fs.rm(base, { recursive: true, force: true });
    const response = await get(null);
    expect(response.status).toBe(401);
    expect((await response.json()).message).toBe("Sessão expirada, entre novamente.");
    await expect(fs.stat(base)).rejects.toThrow();
  });

  it("caminho fora da raiz devolve 403, sem listar nada", async () => {
    await fs.mkdir(path.join(tmp, "alheia", "segredo"), { recursive: true });
    for (const fora of [tmp, `${base}2`, path.join(tmp, "alheia"), path.join(tmp, "alheia", "segredo"), path.parse(base).root]) {
      const response = await get(fora);
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.message).toBe("Essa pasta fica fora da sua pasta de estudos.");
      expect(json.folders).toBeUndefined();
    }
  });

  it("a pasta de outro usuário está fora da raiz (403)", async () => {
    const other = await createTestUser({ name: "Outra Pessoa" });
    await fs.mkdir(userRoot(other), { recursive: true });
    expect((await get(userRoot(other))).status).toBe(403);
  });

  it("caminho inválido devolve 400 com a mensagem", async () => {
    const response = await get("Matemática");
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe("Informe um caminho absoluto, como C:\\Estudos\\Cálculo.");
  });

  it.each([null, "example.com", "8.8.8.8:3000", "evil.com:3000"])("Host %s fora da rede local recebe 403", async (host) => {
    const response = await get(base, host);
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe(FORBIDDEN);
  });

  it("aceita IP da rede local", async () => {
    expect((await get(base, "192.168.10.97:3000")).status).toBe(200);
  });
});

describe("POST /api/pastas", () => {
  it("sem sessão devolve 401 e não cria nada", async () => {
    signOut();
    const response = await post({ pai: base, nome: "SemSessao" });
    expect(response.status).toBe(401);
    await expect(fs.stat(path.join(base, "SemSessao"))).rejects.toThrow();
  });

  it("pai fora da raiz devolve 403 sem criar nada", async () => {
    await fs.mkdir(path.join(tmp, "alheia"), { recursive: true });
    for (const pai of [tmp, path.join(tmp, "alheia"), `${base}2`]) {
      const response = await post({ pai, nome: "Invasor3" }, { origin: "http://localhost:3000" });
      expect(response.status).toBe(403);
      expect((await response.json()).message).toBe("Essa pasta fica fora da sua pasta de estudos.");
    }
    await expect(fs.stat(path.join(tmp, "Invasor3"))).rejects.toThrow();
    await expect(fs.stat(path.join(tmp, "alheia", "Invasor3"))).rejects.toThrow();
  });

  it("cria a subpasta e devolve o caminho", async () => {
    const response = await post({ pai: base, nome: "Química" }, { origin: "http://localhost:3000" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ path: path.join(base, "Química") });
    expect((await fs.stat(path.join(base, "Química"))).isDirectory()).toBe(true);
  });

  it("pasta que já existe devolve 409", async () => {
    const response = await post({ pai: base, nome: "Física" });
    expect(response.status).toBe(409);
    expect((await response.json()).message).toBe("Já existe uma pasta com esse nome.");
  });

  it("nome inválido devolve 400 sem criar nada", async () => {
    const before = await fs.readdir(base);
    const response = await post({ pai: base, nome: "a:b" });
    expect(response.status).toBe(400);
    expect(await fs.readdir(base)).toEqual(before);
  });

  it.each([
    ["JSON inválido", "{"],
    ["campos ausentes", {}],
    ["campos de outro tipo", { pai: 1, nome: ["x"] }],
  ])("%s devolve 400", async (_, body) => {
    expect((await post(body)).status).toBe(400);
  });

  it("Origin de outro site devolve 403 sem criar nada", async () => {
    const response = await post({ pai: base, nome: "Invasor" }, { origin: "http://evil.com" });
    expect(response.status).toBe(403);
    await expect(fs.stat(path.join(base, "Invasor"))).rejects.toThrow();
  });

  it("Host fora da rede local devolve 403", async () => {
    const response = await post({ pai: base, nome: "Invasor2" }, { host: "evil.com" });
    expect(response.status).toBe(403);
    await expect(fs.stat(path.join(base, "Invasor2"))).rejects.toThrow();
  });

  it("corpo que não é JSON (formulário de outro site) devolve 415 sem criar nada", async () => {
    const response = await post("pai=x&nome=y", { contentType: "application/x-www-form-urlencoded" });
    expect(response.status).toBe(415);
  });
});
