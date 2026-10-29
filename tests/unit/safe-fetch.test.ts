// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAiClient, type AiClientConfig } from "@/features/ai/client";
import { BlockedDestinationError, GATEWAY_BLOCKED_MESSAGE, createSafeFetch } from "@/features/ai/url-policy";

let server: http.Server;
let port: number;
let hits = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits += 1;
    if (req.url === "/redirect") {
      // destino que responderia 200: só falha se o redirecionamento for recusado
      res.writeHead(302, { location: `http://127.0.0.1:${port}/models` });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "local" }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("deveria ter falhado");
    },
    (error: unknown) => error,
  );
}

describe("createSafeFetch (modo estrito)", () => {
  it("recusa http sem tocar a rede", async () => {
    const resolve = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
    const error = await rejection(createSafeFetch({ resolve })("http://api.example.com/models"));
    expect(error).toBeInstanceOf(BlockedDestinationError);
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(["https://127.0.0.1/", "https://2130706433/", "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://localhost./", "https://foo.localhost/"])(
    "recusa o destino escondido %s antes de conectar",
    async (url) => {
      const before = hits;
      const error = await rejection(createSafeFetch()(url));
      expect(error).toBeInstanceOf(BlockedDestinationError);
      expect(hits).toBe(before);
    },
  );

  it("https://localhost:<porta> com servidor local real recusa com a mensagem, não 'fetch failed'", async () => {
    const before = hits;
    const error = await rejection(createSafeFetch()(`https://localhost:${port}/`));
    expect(error).toBeInstanceOf(BlockedDestinationError);
    expect((error as Error).message).toBe(GATEWAY_BLOCKED_MESSAGE);
    expect(hits).toBe(before);
  });

  it("nome que resolve para loopback é recusado no lookup (desembrulha a cause)", async () => {
    const before = hits;
    const resolve = vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]);
    const error = await rejection(createSafeFetch({ resolve })(`https://gateway.exemplo.test:${port}/models`));
    expect(error).toBeInstanceOf(BlockedDestinationError);
    expect((error as Error).message).toBe(GATEWAY_BLOCKED_MESSAGE);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(hits).toBe(before);
  });

  it("DNS com público E privado juntos é recusado", async () => {
    const resolve = vi.fn(async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    const error = await rejection(createSafeFetch({ resolve })(`https://misto.exemplo.test:${port}/models`));
    expect(error).toBeInstanceOf(BlockedDestinationError);
  });

  it("pelo cliente, a falha chega ao chamador como 'Endereço do gateway não permitido.'", async () => {
    const config: AiClientConfig = {
      baseUrl: `https://gateway.exemplo.test:${port}/v1`,
      apiKey: "",
      model: "m",
      temperature: 0.2,
      timeout: 30,
      extraParams: {},
    };
    const fetchImpl = createSafeFetch({ resolve: async () => [{ address: "127.0.0.1", family: 4 }] });
    const client = createAiClient(config, fetchImpl);
    await expect(client.listModels()).rejects.toThrow(/^Endereço do gateway não permitido\.$/);
    const result = await client.testConnection();
    expect(result).toMatchObject({ ok: false, error: GATEWAY_BLOCKED_MESSAGE });
    await expect(client.chat("s", "u")).rejects.toThrow(/^Endereço do gateway não permitido\.$/);
  });
});

describe("createSafeFetch com STUDYFLOW_AI_ALLOW_PRIVATE=1", () => {
  it("http em 127.0.0.1 responde 200", async () => {
    vi.stubEnv("STUDYFLOW_AI_ALLOW_PRIVATE", "1");
    const response = await createSafeFetch()(`http://127.0.0.1:${port}/models`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ id: "local" }] });
  });

  it("conecta no endereço que o lookup validou (resolvedor chamado uma vez)", async () => {
    vi.stubEnv("STUDYFLOW_AI_ALLOW_PRIVATE", "1");
    const resolve = vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]);
    const response = await createSafeFetch({ resolve })(`http://nome-inventado.test:${port}/models`);
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith("nome-inventado.test");
  });

  it("redirecionamento é sempre erro, mesmo se o chamador pedir 'follow'", async () => {
    vi.stubEnv("STUDYFLOW_AI_ALLOW_PRIVATE", "1");
    await expect(createSafeFetch()(`http://127.0.0.1:${port}/redirect`, { redirect: "follow" })).rejects.toThrow();
  });
});
