// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => import("./helpers/next-headers"));

import { POST as modelos } from "@/app/api/ai/modelos/route";
import { POST as testar } from "@/app/api/ai/testar/route";
import { saveAiSettings } from "@/features/ai/actions";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

const LOCAL = "localhost:3000";
const PUBLIC = "estudo.aiontecno.com.br";
const SAVED_KEY = "sk-salva-1234567890";
const URL_REQUIRED = "Informe uma URL http ou https válida para o gateway.";
const OTHER_URL_NEEDS_KEY = "Para testar outra Base URL, digite a API key junto (ou salve antes).";
const MODEL_REQUIRED = "Escolha o modelo antes de testar.";

type Options = { host?: string; origin?: string; contentType?: string };

function request(path: string, body: unknown, options: Options = {}) {
  const headers = new Headers({ host: options.host ?? LOCAL, "content-type": options.contentType ?? "application/json" });
  if (options.origin) headers.set("origin", options.origin);
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const post = (body: unknown, options?: Options) => testar(request("/api/ai/testar", body, options));
const postModels = (body: unknown, options?: Options) => modelos(request("/api/ai/modelos", body, options));

const completion = () => Response.json({ choices: [{ message: { content: "OK" } }] });

let fetchMock: ReturnType<typeof vi.fn>;

function lastCall() {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, auth: (init.headers as Record<string, string>).Authorization, body: init.body as string | undefined };
}

async function saveSettings() {
  const result = await saveAiSettings({
    baseUrl: "https://gw/v1",
    apiKey: SAVED_KEY,
    model: "m1",
    temperature: 0.2,
    timeout: 300,
    extraParams: "",
  });
  expect(result.ok).toBe(true);
}

beforeEach(async () => {
  signOut();
  await signInAs(await createTestUser());
  fetchMock = vi.fn(async (url: string) => (String(url).endsWith("/models") ? Response.json({ data: [] }) : completion()));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.aiSettings.deleteMany();
});

describe.each([
  ["testar", post],
  ["modelos", postModels],
])("proteções de %s", (_name, send) => {
  it("no domínio público, Origin igual ao Host não é barrado (chega à configuração)", async () => {
    const response = await send({}, { host: PUBLIC, origin: `https://${PUBLIC}` });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(URL_REQUIRED);
  });

  it("no domínio público, Origin de outro site recebe 403", async () => {
    const response = await send({}, { host: PUBLIC, origin: "https://evil.example" });
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe("Origem não permitida.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no domínio público, sem sessão devolve 401", async () => {
    signOut();
    const response = await send({}, { host: PUBLIC, origin: `https://${PUBLIC}` });
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa Origin de outro site", async () => {
    const response = await send({}, { origin: "http://outro-site.com" });
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe("Origem não permitida.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa content-type que não é JSON", async () => {
    const response = await send({}, { contentType: "text/plain" });
    expect(response.status).toBe(415);
    expect((await response.json()).message).toBe("Envie os dados em JSON.");
  });

  it("recusa corpo que não é JSON válido", async () => {
    const response = await send("{oops");
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe("Envie os dados em JSON.");
  });
});

describe("POST /api/ai/testar", () => {
  it("usa a URL, a chave e o modelo salvos e nunca devolve a chave", async () => {
    await saveSettings();
    const response = await post({});
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ ok: true, reply: "OK" });
    expect(text).not.toContain(SAVED_KEY);
    const call = lastCall();
    expect(call.url).toBe("https://gw/v1/chat/completions");
    expect(call.auth).toBe(`Bearer ${SAVED_KEY}`);
    expect(JSON.parse(call.body as string).model).toBe("m1");
  });

  it("nunca manda a chave salva para outra Base URL digitada sem chave", async () => {
    await saveSettings();
    for (const apiKey of ["", "   "]) {
      const response = await post({ baseUrl: "https://outro/v1", apiKey });
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(JSON.parse(text).message).toBe(OTHER_URL_NEEDS_KEY);
      expect(text).not.toContain(SAVED_KEY);
    }
    const omitted = await post({ baseUrl: "https://outro/v1" });
    expect(omitted.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("com outra Base URL e chave digitada usa a chave digitada", async () => {
    await saveSettings();
    const response = await post({ baseUrl: "https://outro/v1", apiKey: "sk-nova" });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(SAVED_KEY);
    const call = lastCall();
    expect(call.url).toBe("https://outro/v1/chat/completions");
    expect(call.auth).toBe("Bearer sk-nova");
  });

  it("sem chave salva, URL digitada e chave em branco testa o gateway sem Authorization", async () => {
    const response = await post({ baseUrl: "https://gw-local/v1", apiKey: "", model: "m" });
    expect(response.status).toBe(200);
    const call = lastCall();
    expect(call.url).toBe("https://gw-local/v1/chat/completions");
    expect(call.auth).toBeUndefined();
  });

  it("digitar só o modelo mantém a URL e a chave salvas", async () => {
    await saveSettings();
    const response = await post({ model: "m2" });
    expect(response.status).toBe(200);
    const call = lastCall();
    expect(call.url).toBe("https://gw/v1/chat/completions");
    expect(call.auth).toBe(`Bearer ${SAVED_KEY}`);
    expect(JSON.parse(call.body as string).model).toBe("m2");
  });

  it("Base URL digitada igual à salva (com barra final) mantém a chave salva", async () => {
    await saveSettings();
    const response = await post({ baseUrl: " https://gw/v1/ ", apiKey: "" });
    expect(response.status).toBe(200);
    expect(lastCall().auth).toBe(`Bearer ${SAVED_KEY}`);
  });

  it("sem configuração salva e sem URL digitada responde 400", async () => {
    const response = await post({});
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(URL_REQUIRED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("URL digitada inválida responde 400", async () => {
    await saveSettings();
    const response = await post({ baseUrl: "ftp://x" });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(URL_REQUIRED);
  });

  it("sem modelo responde 400", async () => {
    const response = await post({ baseUrl: "https://gw/v1", apiKey: "sk-x" });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(MODEL_REQUIRED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parâmetros extras inválidos respondem 400", async () => {
    const response = await post({ baseUrl: "https://gw/v1", model: "m", extraParams: "{oops" });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/^JSON inválido em Parâmetros extras/);
  });

  it("repassa os parâmetros extras digitados ao gateway", async () => {
    await post({ baseUrl: "https://gw/v1", model: "m", extraParams: '{"top_p": 0.5}' });
    expect(JSON.parse(lastCall().body as string).top_p).toBe(0.5);
  });

  it("falha do gateway volta como TestResult 200 sem a chave", async () => {
    await saveSettings();
    fetchMock.mockResolvedValueOnce(new Response(`bad key ${SAVED_KEY}`, { status: 401 }));
    const response = await post({});
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ ok: false, status: 401 });
    expect(text).not.toContain(SAVED_KEY);
  });
});

describe("POST /api/ai/modelos", () => {
  it("lista os modelos ordenados, sem exigir modelo", async () => {
    await saveSettings();
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ id: "b" }, { id: "a" }] }));
    const response = await postModels({ model: "" });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ models: ["a", "b"] });
    expect(text).not.toContain(SAVED_KEY);
    const call = lastCall();
    expect(call.url).toBe("https://gw/v1/models");
    expect(call.auth).toBe(`Bearer ${SAVED_KEY}`);
  });

  it("sem modelo salvo ainda responde 200", async () => {
    const response = await postModels({ baseUrl: "https://gw/v1", apiKey: "sk-x" });
    expect(response.status).toBe(200);
  });

  it("gateway 401 vira 502 com a mensagem e sem a chave", async () => {
    await saveSettings();
    fetchMock.mockResolvedValueOnce(new Response(`unauthorized ${SAVED_KEY}`, { status: 401 }));
    const response = await postModels({});
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text).message).toMatch(/^Não foi possível listar os modelos: HTTP 401/);
    expect(text).not.toContain(SAVED_KEY);
  });

  it("nunca manda a chave salva para outra Base URL digitada sem chave", async () => {
    await saveSettings();
    const response = await postModels({ baseUrl: "https://outro/v1", apiKey: "" });
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(JSON.parse(text).message).toBe(OTHER_URL_NEEDS_KEY);
    expect(text).not.toContain(SAVED_KEY);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem configuração salva e sem URL responde 400", async () => {
    const response = await postModels({});
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(URL_REQUIRED);
  });
});
