import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/cards/actions", () => ({ createCard: vi.fn(), updateCard: vi.fn() }));
vi.mock("@/features/ai/actions", () => ({ generateCardQuestion: vi.fn(), generateCardAnswer: vi.fn() }));

import { generateCardAnswer, generateCardQuestion } from "@/features/ai/actions";
import { CardFormModal } from "@/features/cards/components/CardFormModal";

const onError = vi.fn();
const readText = vi.fn();

function renderModal(props: Partial<React.ComponentProps<typeof CardFormModal>> = {}) {
  render(
    <CardFormModal
      open
      studyId="estudo-1"
      cellId="celula-1"
      descricaoEstudo="Biologia"
      onClose={vi.fn()}
      onSaved={vi.fn()}
      onError={onError}
      {...props}
    />,
  );
  // userEvent.setup() instala o próprio clipboard: o stub vem depois.
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
  return user;
}

const pergunta = () => screen.getByLabelText("Pergunta") as HTMLTextAreaElement;
const resposta = () => screen.getByLabelText("Resposta") as HTMLTextAreaElement;

beforeEach(() => {
  vi.clearAllMocks();
  readText.mockResolvedValue("Texto copiado do estudo.");
  vi.mocked(generateCardQuestion).mockResolvedValue({ ok: true, text: "Pergunta gerada?" });
  vi.mocked(generateCardAnswer).mockResolvedValue({ ok: true, text: "Resposta gerada." });
});

describe("CardFormModal: botão IA", () => {
  it("gera a pergunta com o texto do clipboard e depois a resposta com o texto da pergunta", async () => {
    const user = renderModal();

    await user.click(screen.getByRole("button", { name: "IA" }));

    await waitFor(() => expect(resposta().value).toBe("Resposta gerada."));
    expect(pergunta().value).toBe("Pergunta gerada?");
    expect(generateCardQuestion).toHaveBeenCalledWith("Texto copiado do estudo.");
    expect(generateCardAnswer).toHaveBeenCalledWith("Pergunta gerada?");
    expect(onError).not.toHaveBeenCalled();
  });

  it("substitui a pergunta e a resposta que já estavam preenchidas", async () => {
    const user = renderModal();
    await user.type(pergunta(), "pergunta antiga");
    await user.type(resposta(), "resposta antiga");

    await user.click(screen.getByRole("button", { name: "IA" }));

    await waitFor(() => expect(resposta().value).toBe("Resposta gerada."));
    expect(pergunta().value).toBe("Pergunta gerada?");
  });

  it("mostra o erro e não chama a IA quando o clipboard está vazio", async () => {
    readText.mockResolvedValue("   ");
    const user = renderModal();

    await user.click(screen.getByRole("button", { name: "IA" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("Ctrl+C")));
    expect(generateCardQuestion).not.toHaveBeenCalled();
  });

  it("mostra o erro e não chama a IA quando o navegador nega a leitura do clipboard", async () => {
    readText.mockRejectedValue(new DOMException("negado", "NotAllowedError"));
    const user = renderModal();

    await user.click(screen.getByRole("button", { name: "IA" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("Ctrl+C")));
    expect(generateCardQuestion).not.toHaveBeenCalled();
  });

  it("mostra o erro da pergunta, mantém os campos e não pede a resposta", async () => {
    vi.mocked(generateCardQuestion).mockResolvedValue({ ok: false, message: "HTTP 401: chave inválida" });
    const user = renderModal({ initialPergunta: "pergunta existente" });

    await user.click(screen.getByRole("button", { name: "IA" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("HTTP 401: chave inválida"));
    expect(pergunta().value).toBe("pergunta existente");
    expect(generateCardAnswer).not.toHaveBeenCalled();
  });

  it("se a resposta falhar, mantém a pergunta gerada, limpa a resposta antiga e mostra o erro", async () => {
    vi.mocked(generateCardAnswer).mockResolvedValue({ ok: false, message: "Tempo esgotado (300 s)." });
    const user = renderModal();
    await user.type(resposta(), "resposta antiga");

    await user.click(screen.getByRole("button", { name: "IA" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Tempo esgotado (300 s)."));
    expect(pergunta().value).toBe("Pergunta gerada?");
    expect(resposta().value).toBe("");
  });

  it("mostra erro genérico se a chamada ao servidor falhar", async () => {
    vi.mocked(generateCardQuestion).mockRejectedValue(new Error("rede"));
    const user = renderModal();

    await user.click(screen.getByRole("button", { name: "IA" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("IA")));
    expect(screen.getByRole("button", { name: "IA" })).toBeEnabled();
  });

  it("desabilita o botão e mostra 'Gerando…' enquanto a IA trabalha", async () => {
    let finishQuestion: (value: { ok: true; text: string }) => void = () => {};
    vi.mocked(generateCardQuestion).mockReturnValue(new Promise((resolve) => (finishQuestion = resolve)));
    const user = renderModal();

    await user.click(screen.getByRole("button", { name: "IA" }));

    const busy = await screen.findByRole("button", { name: "Gerando…" });
    expect(busy).toBeDisabled();

    finishQuestion({ ok: true, text: "Pergunta gerada?" });
    await waitFor(() => expect(screen.getByRole("button", { name: "IA" })).toBeEnabled());
    expect(resposta().value).toBe("Resposta gerada.");
  });
});
