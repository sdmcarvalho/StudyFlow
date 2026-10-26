import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/ai/actions", () => ({ saveAiSettings: vi.fn() }));

import { saveAiSettings } from "@/features/ai/actions";
import { AiSettingsForm } from "@/features/ai/components/AiSettingsForm";
import type { AiSettingsPublic } from "@/features/ai/types";

const FULL_KEY = "sk-secret-0123456789-VdU";

const initial: AiSettingsPublic = {
  baseUrl: "https://gateway.example.com/v1",
  apiKeyMasked: "sk-s…VdU",
  hasKey: true,
  model: "qwen-max",
  temperature: 0.2,
  timeout: 300,
  extraParams: "",
};

const empty: AiSettingsPublic = {
  baseUrl: "",
  apiKeyMasked: "",
  hasKey: false,
  model: "",
  temperature: 0.2,
  timeout: 300,
  extraParams: "",
};

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function lastRequestBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1);
  return JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
}

/** Resultado do Testar: o Toast também usa role="status", então procura pelo texto. */
function statusWithText(text: string | RegExp) {
  return screen.getAllByRole("status").find((el) => (typeof text === "string" ? el.textContent === text : text.test(el.textContent ?? "")));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(saveAiSettings).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiSettingsForm: renderização", () => {
  it("mostra os valores salvos e a chave só como placeholder, nunca como valor", () => {
    const { container } = render(<AiSettingsForm initial={initial} />);

    expect(screen.getByLabelText("Gateway base URL")).toHaveValue("https://gateway.example.com/v1");
    const key = screen.getByLabelText("Gateway API key");
    expect(key).toHaveAttribute("type", "password");
    expect(key).toHaveValue("");
    expect(key).toHaveAttribute("placeholder", "sk-s…VdU");
    expect(screen.getByLabelText("Modelo")).toHaveValue("qwen-max");
    expect(screen.getByLabelText("Temperatura")).toHaveValue("0.2");
    expect(screen.getByLabelText("Timeout (segundos)")).toHaveValue("300");
    expect(screen.getByLabelText("Parâmetros extras (JSON)")).toHaveValue("");
    expect(screen.getByText("Deixe em branco para manter a chave salva.")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(FULL_KEY);
  });

  it("sem chave salva o placeholder fica vazio", () => {
    render(<AiSettingsForm initial={empty} />);
    expect(screen.getByLabelText("Gateway API key")).toHaveAttribute("placeholder", "");
  });
});

describe("AiSettingsForm: Testar", () => {
  it("sucesso mostra latência e resposta; o corpo leva baseUrl e não leva apiKey quando vazia", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, latencyMs: 820, reply: "OK", error: null, status: 200 }));
    render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Testar" }));

    expect(await screen.findByText("OK · 820 ms · resposta: OK")).toBeInTheDocument();
    expect(statusWithText("OK · 820 ms · resposta: OK")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/testar");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    const body = lastRequestBody();
    expect(body.baseUrl).toBe("https://gateway.example.com/v1");
    expect(body.model).toBe("qwen-max");
    expect(body).not.toHaveProperty("apiKey");
  });

  it("a apiKey digitada vai no corpo", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, latencyMs: 5, reply: "OK", error: null, status: 200 }));
    render(<AiSettingsForm initial={initial} />);

    await userEvent.type(screen.getByLabelText("Gateway API key"), "sk-nova");
    await userEvent.click(screen.getByRole("button", { name: "Testar" }));

    await screen.findByText("OK · 5 ms · resposta: OK");
    expect(lastRequestBody().apiKey).toBe("sk-nova");
  });

  it("falha com status mostra HTTP e o erro", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, latencyMs: 40, reply: "", error: "chave inválida", status: 401 }),
    );
    render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Testar" }));

    expect(await screen.findByText("Falha · HTTP 401 · chave inválida")).toBeInTheDocument();
  });

  it("falha sem status mostra só o erro", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, latencyMs: 40, reply: "", error: "Erro de rede: fetch failed", status: null }),
    );
    render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Testar" }));

    expect(await screen.findByText("Falha · Erro de rede: fetch failed")).toBeInTheDocument();
  });

  it("falha com erro vazio mostra Falha · HTTP <status>, ou só Falha sem status", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, latencyMs: 1, reply: "", error: "", status: 503 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, latencyMs: 1, reply: "", error: "", status: null }));
    render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Testar" }));
    expect(await screen.findByText("Falha · HTTP 503")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Testar" }));
    expect(await screen.findByText("Falha")).toBeInTheDocument();
  });

  it("resposta 400 mostra a mensagem da rota", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Escolha o modelo antes de testar." }, 400));
    render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Testar" }));

    expect(await screen.findByText("Escolha o modelo antes de testar.")).toBeInTheDocument();
  });

  it("falha de rede mostra mensagem e o botão volta ao normal", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Testar" }));

    expect(await screen.findByText("Não foi possível falar com o servidor. Tente novamente.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Testar" })).toBeEnabled();
  });

  it("desabilita os botões enquanto o teste está pendente", async () => {
    let resolve: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Testar" }));

    expect(screen.getByRole("button", { name: "Testar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Buscar modelos" })).toBeDisabled();

    resolve(jsonResponse({ ok: true, latencyMs: 1, reply: "OK", error: null, status: 200 }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Testar" })).toBeEnabled());
  });

  it("aceita vírgula decimal na temperatura e manda com ponto", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, latencyMs: 1, reply: "OK", error: null, status: 200 }));
    render(<AiSettingsForm initial={initial} />);

    const temperature = screen.getByLabelText("Temperatura");
    await userEvent.clear(temperature);
    await userEvent.type(temperature, "0,5");
    await userEvent.click(screen.getByRole("button", { name: "Testar" }));

    await screen.findByText("OK · 1 ms · resposta: OK");
    expect(lastRequestBody().temperature).toBe(0.5);
  });
});

describe("AiSettingsForm: Buscar modelos", () => {
  it("preenche o datalist com as opções", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ models: ["a", "b"] }));
    const { container } = render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Buscar modelos" }));

    await waitFor(() => expect(container.querySelectorAll("datalist option")).toHaveLength(2));
    const values = Array.from(container.querySelectorAll("datalist option")).map((o) => o.getAttribute("value"));
    expect(values).toEqual(["a", "b"]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/modelos");
    expect(lastRequestBody()).not.toHaveProperty("apiKey");
    // O campo está ligado ao datalist e continua aceitando texto livre.
    const model = screen.getByLabelText("Modelo");
    expect(model).toHaveAttribute("list", container.querySelector("datalist")?.id);
    await userEvent.clear(model);
    await userEvent.type(model, "meu-modelo");
    expect(model).toHaveValue("meu-modelo");
  });

  it("falha 502 mostra a mensagem em linha", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Não foi possível listar os modelos: HTTP 500: x" }, 502));
    render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Buscar modelos" }));

    expect(await screen.findByText("Não foi possível listar os modelos: HTTP 500: x")).toBeInTheDocument();
  });
});

describe("AiSettingsForm: Salvar", () => {
  it("chama saveAiSettings com os valores do formulário e mostra o toast", async () => {
    vi.mocked(saveAiSettings).mockResolvedValue({ ok: true, data: { ...initial, model: "novo" } });
    render(<AiSettingsForm initial={initial} />);

    const model = screen.getByLabelText("Modelo");
    await userEvent.clear(model);
    await userEvent.type(model, "novo");
    await userEvent.type(screen.getByLabelText("Gateway API key"), "sk-nova");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(saveAiSettings).toHaveBeenCalledWith({
      baseUrl: "https://gateway.example.com/v1",
      apiKey: "sk-nova",
      model: "novo",
      temperature: 0.2,
      timeout: 300,
      extraParams: "",
    });
    expect(await screen.findByText("Configuração salva.")).toBeInTheDocument();
    // Depois de salvar o campo da chave volta a ficar vazio.
    expect(screen.getByLabelText("Gateway API key")).toHaveValue("");
  });

  it("apiKey vazia vai vazia (o servidor mantém a salva)", async () => {
    vi.mocked(saveAiSettings).mockResolvedValue({ ok: true, data: initial });
    render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(saveAiSettings).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "" }));
  });

  it("vírgula decimal na temperatura é convertida antes de salvar", async () => {
    vi.mocked(saveAiSettings).mockResolvedValue({ ok: true, data: initial });
    render(<AiSettingsForm initial={initial} />);

    const temperature = screen.getByLabelText("Temperatura");
    await userEvent.clear(temperature);
    await userEvent.type(temperature, "0,5");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(saveAiSettings).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.5 }));
  });

  it("fieldErrors aparecem sob o campo certo, com role=alert", async () => {
    vi.mocked(saveAiSettings).mockResolvedValue({
      ok: false,
      fieldErrors: { baseUrl: "Use uma URL http ou https válida.", timeout: "Use um valor inteiro entre 10 e 600." },
    });
    render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    const urlError = await screen.findByText("Use uma URL http ou https válida.");
    expect(urlError).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("Gateway base URL")).toHaveAccessibleDescription("Use uma URL http ou https válida.");
    expect(screen.getByLabelText("Gateway base URL")).toBeInvalid();
    expect(screen.getByLabelText("Timeout (segundos)")).toHaveAccessibleDescription(
      "Use um valor inteiro entre 10 e 600.",
    );
    expect(screen.getByLabelText("Temperatura")).not.toBeInvalid();
    expect(screen.queryByText("Configuração salva.")).not.toBeInTheDocument();
  });

  it("falha geral mostra a message no toast", async () => {
    vi.mocked(saveAiSettings).mockResolvedValue({ ok: false, message: "Não foi possível salvar a configuração." });
    render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar a configuração.")).toBeInTheDocument();
  });

  it("a chamada que lança vira toast e o botão volta ao normal", async () => {
    vi.mocked(saveAiSettings).mockRejectedValue(new Error("boom"));
    render(<AiSettingsForm initial={initial} />);

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar a configuração.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });
});
