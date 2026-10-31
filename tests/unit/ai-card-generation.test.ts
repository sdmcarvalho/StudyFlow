import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/current-user", () => ({ getCurrentUserId: vi.fn().mockResolvedValue("test-user") }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/features/ai/resolve-config", () => ({ resolveAiConfig: vi.fn() }));
vi.mock("@/features/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/ai/client")>()),
  createAiClient: vi.fn(),
}));

import { generateCardAnswer, generateCardQuestion, summarizeText } from "@/features/ai/actions";
import { AiError, createAiClient, type AiClientConfig } from "@/features/ai/client";
import { resolveAiConfig } from "@/features/ai/resolve-config";

const config: AiClientConfig = {
  baseUrl: "https://gateway.example.com/v1",
  apiKey: "sk-secret",
  model: "modelo-teste",
  temperature: 0.2,
  timeout: 300,
  extraParams: {},
};

const chat = vi.fn();

function mockChatReply(text: string) {
  chat.mockResolvedValue({ text, finishReason: "stop" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveAiConfig).mockResolvedValue({ ok: true, config });
  vi.mocked(createAiClient).mockReturnValue({ chat } as unknown as ReturnType<typeof createAiClient>);
  mockChatReply("Resposta da IA");
});

describe("generateCardQuestion", () => {
  it("envia o prompt da pergunta com o texto do clipboard e devolve a resposta da IA", async () => {
    mockChatReply("  O que é uma célula?  ");

    const result = await generateCardQuestion("Uma célula é a unidade básica da vida.");

    expect(result).toEqual({ ok: true, text: "O que é uma célula?" });
    expect(chat).toHaveBeenCalledTimes(1);
    const [, user] = chat.mock.calls[0];
    expect(user).toBe("Faça uma pergunta com um parágrafo curto do texto: Uma célula é a unidade básica da vida.");
  });

  it("usa a configuração salva (sem valores digitados) e o modelo escolhido em Configuração", async () => {
    await generateCardQuestion("texto");

    expect(resolveAiConfig).toHaveBeenCalledWith({}, { requireModel: false });
    expect(createAiClient).toHaveBeenCalledWith(config);
  });

  it("recusa texto vazio ou em branco sem chamar a IA", async () => {
    for (const text of ["", "   \n "]) {
      const result = await generateCardQuestion(text);
      expect(result.ok).toBe(false);
    }
    expect(chat).not.toHaveBeenCalled();
  });

  it("recusa texto que não é string", async () => {
    const result = await generateCardQuestion(undefined as unknown as string);
    expect(result.ok).toBe(false);
    expect(chat).not.toHaveBeenCalled();
  });

  it("recusa texto grande demais sem chamar a IA", async () => {
    const result = await generateCardQuestion("a".repeat(20_001));
    expect(result).toEqual({ ok: false, message: expect.stringContaining("20 000") });
    expect(chat).not.toHaveBeenCalled();
  });

  it("devolve o motivo quando a configuração é inválida", async () => {
    vi.mocked(resolveAiConfig).mockResolvedValue({ ok: false, status: 400, message: "Informe uma URL http ou https válida para o gateway." });

    const result = await generateCardQuestion("texto");

    expect(result).toEqual({ ok: false, message: "Informe uma URL http ou https válida para o gateway." });
    expect(chat).not.toHaveBeenCalled();
  });

  it("pede para escolher o modelo quando nenhum foi salvo", async () => {
    vi.mocked(resolveAiConfig).mockResolvedValue({ ok: true, config: { ...config, model: "" } });

    const result = await generateCardQuestion("texto");

    expect(result).toEqual({ ok: false, message: expect.stringContaining("modelo") });
    expect(chat).not.toHaveBeenCalled();
  });

  it("repassa a mensagem do erro da IA", async () => {
    chat.mockRejectedValue(new AiError("HTTP 401: chave inválida", 401));

    const result = await generateCardQuestion("texto");

    expect(result).toEqual({ ok: false, message: "HTTP 401: chave inválida" });
  });

  it("usa mensagem genérica para erros inesperados", async () => {
    chat.mockRejectedValue(new Error("detalhe interno"));

    const result = await generateCardQuestion("texto");

    expect(result).toEqual({ ok: false, message: expect.not.stringContaining("detalhe interno") });
    expect(result.ok).toBe(false);
  });

  it("falha quando a IA devolve texto vazio", async () => {
    mockChatReply("   ");

    const result = await generateCardQuestion("texto");

    expect(result.ok).toBe(false);
  });

  it("corta a resposta em 5000 caracteres, o limite dos campos do card", async () => {
    mockChatReply("x".repeat(6000));

    const result = await generateCardQuestion("texto");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toHaveLength(5000);
  });
});

describe("generateCardAnswer", () => {
  it("envia o prompt da resposta com o texto da pergunta", async () => {
    mockChatReply("É a unidade básica da vida.");

    const result = await generateCardAnswer("O que é uma célula?");

    expect(result).toEqual({ ok: true, text: "É a unidade básica da vida." });
    const [, user] = chat.mock.calls[0];
    expect(user).toBe("Responda em um parágrafo curto a pergunta O que é uma célula?");
  });

  it("recusa pergunta vazia sem chamar a IA", async () => {
    const result = await generateCardAnswer("  ");

    expect(result.ok).toBe(false);
    expect(chat).not.toHaveBeenCalled();
  });
});

describe("summarizeText", () => {
  it("envia o prompt do resumo com o texto da célula e devolve o resumo", async () => {
    mockChatReply("  Resumo curto.  ");

    const result = await summarizeText("# Título\n\nTexto longo da célula.");

    expect(result).toEqual({ ok: true, text: "Resumo curto." });
    const [, user] = chat.mock.calls[0];
    expect(user).toBe("Resuma em um parágrafo curto o texto: # Título\n\nTexto longo da célula.");
  });

  it("recusa texto vazio sem chamar a IA", async () => {
    const result = await summarizeText("  \n ");

    expect(result.ok).toBe(false);
    expect(chat).not.toHaveBeenCalled();
  });

  it("recusa texto grande demais sem chamar a IA", async () => {
    const result = await summarizeText("a".repeat(20_001));

    expect(result).toEqual({ ok: false, message: expect.stringContaining("20 000") });
    expect(chat).not.toHaveBeenCalled();
  });

  it("repassa a mensagem do erro da IA", async () => {
    chat.mockRejectedValue(new AiError("Tempo esgotado (300 s)."));

    expect(await summarizeText("texto")).toEqual({ ok: false, message: "Tempo esgotado (300 s)." });
  });
});
