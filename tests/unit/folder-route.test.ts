// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/pastas/route";

let base: string;

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-pastas-"));
  await fs.mkdir(path.join(base, "Física"));
});

afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true });
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
  it("lista as subpastas e as unidades", async () => {
    const response = await get(base);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.path).toBe(base);
    expect(json.folders).toEqual(["Física"]);
    expect(json.drives).toContain(path.parse(base).root);
  });

  it("sem caminho devolve só as unidades", async () => {
    const json = await (await get(null)).json();
    expect(json.path).toBeNull();
    expect(json.folders).toEqual([]);
    expect(json.drives.length).toBeGreaterThan(0);
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
