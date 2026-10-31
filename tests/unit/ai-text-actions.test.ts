import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/current-user", () => ({ getCurrentUserId: vi.fn().mockResolvedValue("test-user") }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/features/ai/resolve-config", () => ({ resolveAiConfig: vi.fn() }));
vi.mock("@/features/ai/gateway", () => ({ createGatewayClient: vi.fn() }));

import { generateCardAnswer, generateCardQuestion, summarizeText } from "@/features/ai/actions";
import type { AiClientConfig } from "@/features/ai/client";
import { createGatewayClient } from "@/features/ai/gateway";
import { resolveAiConfig } from "@/features/ai/resolve-config";

const config: AiClientConfig = {
  baseUrl: "https://gateway.example.com/v1",
  apiKey: "sk-secret-key",
  model: "modelo-teste",
  temperature: 0.2,
  timeout: 300,
  extraParams: {},
};

const chat = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveAiConfig).mockResolvedValue({ ok: true, config });
  vi.mocked(createGatewayClient).mockReturnValue({ chat } as unknown as ReturnType<typeof createGatewayClient>);
  chat.mockResolvedValue({ text: "ok", finishReason: "stop" });
});

describe("ações de texto da IA", () => {
  it("recusa entrada que não é string em todas as ações sem chamar a IA", async () => {
    for (const action of [generateCardAnswer, summarizeText]) {
      for (const input of [undefined, null, 42, { texto: "x" }]) {
        expect((await action(input as unknown as string)).ok).toBe(false);
      }
    }
    expect(resolveAiConfig).not.toHaveBeenCalled();
    expect(chat).not.toHaveBeenCalled();
  });

  it("aceita exatamente 20 000 caracteres e envia o texto sem os espaços das pontas", async () => {
    const text = "a".repeat(20_000);
    expect((await summarizeText(`  ${text}  `)).ok).toBe(true);
    expect(chat.mock.calls[0][1]).toBe(`Resuma em um parágrafo curto o texto: ${text}`);
  });

  it("trata modelo só com espaços como não escolhido", async () => {
    vi.mocked(resolveAiConfig).mockResolvedValue({ ok: true, config: { ...config, model: "   " } });
    expect(await generateCardQuestion("texto")).toEqual({ ok: false, message: expect.stringContaining("modelo") });
    expect(chat).not.toHaveBeenCalled();
  });

  it("envia um prompt de sistema em português pedindo só o texto", async () => {
    await generateCardAnswer("Pergunta?");
    const [system] = chat.mock.calls[0];
    expect(typeof system).toBe("string");
    expect(system).toMatch(/apenas/);
    expect(system.length).toBeLessThan(500);
  });

  it("não expõe detalhes nem a chave quando a configuração falha de forma inesperada", async () => {
    vi.mocked(resolveAiConfig).mockRejectedValue(new Error(`falha no banco com ${config.apiKey}`));
    const result = await summarizeText("texto");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain("banco");
      expect(result.message).not.toContain(config.apiKey);
    }
  });
});
