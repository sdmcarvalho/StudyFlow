// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AiError, createAiClient, type AiClientConfig } from "@/features/ai/client";

type Call = { url: string; init: RequestInit; headers: Record<string, string>; body: Record<string, unknown> | null };

function mockFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const call: Call = { url: String(input), init: init ?? {}, headers, body };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const base: AiClientConfig = {
  baseUrl: "https://gw.exemplo.com/v1",
  apiKey: "sk-abc",
  model: "m1",
  temperature: 0.2,
  timeout: 300,
  extraParams: {},
};

describe("listModels", () => {
  it("devolve ids ordenados e normaliza a barra final", async () => {
    const { fetchImpl, calls } = mockFetch(() => json({ data: [{ id: "b" }, { id: "a" }] }));
    const client = createAiClient({ ...base, baseUrl: "https://gw.exemplo.com/v1/" }, fetchImpl);
    await expect(client.listModels()).resolves.toEqual(["a", "b"]);
    expect(calls[0].url).toBe("https://gw.exemplo.com/v1/models");
  });

  it("401 rejeita com AiError e status", async () => {
    const { fetchImpl } = mockFetch(() => json({ error: { message: "chave inválida" } }, 401));
    const client = createAiClient(base, fetchImpl);
    const err = await client.listModels().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).status).toBe(401);
    expect((err as AiError).message).toBe("HTTP 401: chave inválida");
  });
});

describe("testConnection", () => {
  it("200 devolve ok, reply e latência; corpo com max_tokens e sem temperature", async () => {
    const { fetchImpl, calls } = mockFetch(() => json({ choices: [{ message: { content: " OK " } }] }));
    const r = await createAiClient(base, fetchImpl).testConnection();
    expect(r).toMatchObject({ ok: true, reply: "OK", status: 200, error: null });
    expect(typeof r.latencyMs).toBe("number");
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(calls[0].url).toBe("https://gw.exemplo.com/v1/chat/completions");
    expect(calls[0].body).toMatchObject({ model: "m1", max_tokens: 5 });
    expect(calls[0].body).not.toHaveProperty("temperature");
  });

  it("401 devolve ok:false com status e mensagem", async () => {
    const { fetchImpl } = mockFetch(() => json({ error: { message: "chave inválida" } }, 401));
    const r = await createAiClient(base, fetchImpl).testConnection();
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(r.error).toContain("chave inválida");
  });

  it("500 com corpo não-JSON trunca o erro em 500 caracteres", async () => {
    const { fetchImpl } = mockFetch(() => new Response("x".repeat(2000), { status: 500 }));
    const r = await createAiClient(base, fetchImpl).testConnection();
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    expect(r.error!.length).toBeLessThanOrEqual(500);
  });

  it("timeout vira mensagem em português", async () => {
    const { fetchImpl } = mockFetch(() => Promise.reject(new DOMException("x", "TimeoutError")));
    const r = await createAiClient(base, fetchImpl).testConnection();
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Tempo esgotado (60 s).");
  });

  it("falha de rede vira 'Erro de rede: ...'", async () => {
    const { fetchImpl } = mockFetch(() => Promise.reject(new TypeError("fetch failed")));
    const r = await createAiClient(base, fetchImpl).testConnection();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^Erro de rede:/);
  });

  it("200 com corpo não-JSON nunca lança", async () => {
    const { fetchImpl } = mockFetch(() => new Response("<html>oi</html>", { status: 200 }));
    const r = await createAiClient(base, fetchImpl).testConnection();
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("não vaza a chave no texto de erro", async () => {
    const key = "sk-segredo-123";
    const { fetchImpl } = mockFetch(() =>
      json({ error: { message: `Incorrect API key provided: ${key}. Use ${key} again.` } }, 401),
    );
    const r = await createAiClient({ ...base, apiKey: key }, fetchImpl).testConnection();
    expect(r.error).not.toContain(key);
    expect(r.error).toContain("***");
  });

  it("não vaza a chave em erros de rede nem em listModels", async () => {
    const key = "sk-segredo-123";
    const net = mockFetch(() => Promise.reject(new TypeError(`falha com ${key}`)));
    const r = await createAiClient({ ...base, apiKey: key }, net.fetchImpl).testConnection();
    expect(r.error).not.toContain(key);
    const http = mockFetch(() => new Response(`bad ${key}`, { status: 403 }));
    const err = await createAiClient({ ...base, apiKey: key }, http.fetchImpl)
      .listModels()
      .catch((e: unknown) => e as AiError);
    expect((err as AiError).message).not.toContain(key);
  });
});

describe("redirect e extras", () => {
  it("listModels, testConnection e chat mandam redirect: error", async () => {
    const { fetchImpl, calls } = mockFetch((call) =>
      call.url.endsWith("/models") ? json({ data: [] }) : json({ choices: [{ message: { content: "OK" } }] }),
    );
    const client = createAiClient(base, fetchImpl);
    await client.listModels();
    await client.testConnection();
    await client.chat("s", "u");
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(call.init.redirect).toBe("error");
  });

  it("extraParams não mudam o max_tokens de testConnection", async () => {
    const { fetchImpl, calls } = mockFetch(() => json({ choices: [{ message: { content: "OK" } }] }));
    await createAiClient({ ...base, extraParams: { max_tokens: 4096, top_p: 0.5 } }, fetchImpl).testConnection();
    expect(calls[0].body).toMatchObject({ max_tokens: 5, top_p: 0.5 });
  });
});

describe("cabeçalhos", () => {
  it("apara a chave no Authorization", async () => {
    const { fetchImpl, calls } = mockFetch(() => json({ data: [] }));
    await createAiClient({ ...base, apiKey: "  sk-abc\n" }, fetchImpl).listModels();
    expect(calls[0].headers.Authorization).toBe("Bearer sk-abc");
  });

  it("sem chave não envia Authorization", async () => {
    const { fetchImpl, calls } = mockFetch(() => json({ data: [] }));
    await createAiClient({ ...base, apiKey: "" }, fetchImpl).listModels();
    expect(calls[0].headers).not.toHaveProperty("Authorization");
  });
});

describe("parâmetros por provedor", () => {
  const ok = () => json({ choices: [{ message: { content: "OK" } }] });

  it("Alibaba envia enable_thinking:false", async () => {
    const { fetchImpl, calls } = mockFetch(ok);
    await createAiClient({ ...base, baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" }, fetchImpl).testConnection();
    expect(calls[0].body).toHaveProperty("enable_thinking", false);
  });

  it("outro host não envia enable_thinking", async () => {
    const { fetchImpl, calls } = mockFetch(ok);
    await createAiClient(base, fetchImpl).testConnection();
    expect(calls[0].body).not.toHaveProperty("enable_thinking");
  });

  it("extraParams do usuário vencem o padrão da Alibaba", async () => {
    const { fetchImpl, calls } = mockFetch(ok);
    await createAiClient(
      { ...base, baseUrl: "https://dashscope.aliyuncs.com/v1", extraParams: { enable_thinking: true } },
      fetchImpl,
    ).chat("s", "u");
    expect(calls[0].body).toHaveProperty("enable_thinking", true);
  });
});

describe("chat", () => {
  it("devolve texto e finishReason e envia temperature", async () => {
    const { fetchImpl, calls } = mockFetch(() =>
      json({ choices: [{ message: { content: "oi" }, finish_reason: "stop" }] }),
    );
    const r = await createAiClient(base, fetchImpl).chat("sistema", "usuario", 100);
    expect(r).toEqual({ text: "oi", finishReason: "stop" });
    expect(calls[0].body).toMatchObject({
      model: "m1",
      temperature: 0.2,
      max_tokens: 100,
      messages: [
        { role: "system", content: "sistema" },
        { role: "user", content: "usuario" },
      ],
    });
  });

  it("sem max_tokens não envia o campo", async () => {
    const { fetchImpl, calls } = mockFetch(() => json({ choices: [{ message: { content: "oi" } }] }));
    const r = await createAiClient(base, fetchImpl).chat("s", "u");
    expect(r.finishReason).toBe("stop");
    expect(calls[0].body).not.toHaveProperty("max_tokens");
  });

  it("resposta sem choices rejeita com AiError", async () => {
    const { fetchImpl } = mockFetch(() => json({ foo: 1 }));
    const err = await createAiClient(base, fetchImpl).chat("s", "u").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).message).toMatch(/^Resposta inesperada da API:/);
  });

  it("erro HTTP rejeita com AiError e status", async () => {
    const { fetchImpl } = mockFetch(() => json({ error: { message: "limite" } }, 429));
    const err = await createAiClient(base, fetchImpl).chat("s", "u").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).status).toBe(429);
    expect((err as AiError).message).toBe("HTTP 429: limite");
  });
});
