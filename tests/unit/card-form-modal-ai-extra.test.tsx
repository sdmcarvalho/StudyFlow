import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/cards/actions", () => ({ createCard: vi.fn(), updateCard: vi.fn() }));
vi.mock("@/features/ai/actions", () => ({ generateCardQuestion: vi.fn(), generateCardAnswer: vi.fn() }));

import { generateCardAnswer, generateCardQuestion } from "@/features/ai/actions";
import { CardFormModal } from "@/features/cards/components/CardFormModal";

const onError = vi.fn();
const readText = vi.fn();

function renderModal() {
  const view = render(
    <CardFormModal
      open
      studyId="estudo-1"
      cellId="celula-1"
      descricaoEstudo="Biologia"
      onClose={vi.fn()}
      onSaved={vi.fn()}
      onError={onError}
    />,
  );
  // userEvent.setup() instala o próprio clipboard: o stub vem depois.
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
  return { user, ...view };
}

const pergunta = () => screen.getByLabelText("Pergunta") as HTMLTextAreaElement;
const resposta = () => screen.getByLabelText("Resposta") as HTMLTextAreaElement;

beforeEach(() => {
  vi.clearAllMocks();
  readText.mockResolvedValue("Texto copiado do estudo.");
  vi.mocked(generateCardQuestion).mockResolvedValue({ ok: true, text: "Pergunta gerada?" });
  vi.mocked(generateCardAnswer).mockResolvedValue({ ok: true, text: "Resposta gerada." });
});

describe("CardFormModal: botão IA (casos extremos)", () => {
  it("se a geração da resposta lançar erro, mantém a pergunta nova, limpa a resposta antiga e libera o botão", async () => {
    vi.mocked(generateCardAnswer).mockRejectedValue(new Error("falha de rede"));
    const { user } = renderModal();
    await user.type(pergunta(), "pergunta antiga");
    await user.type(resposta(), "resposta antiga");

    await user.click(screen.getByRole("button", { name: "IA" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("IA")));
    expect(pergunta().value).toBe("Pergunta gerada?");
    expect(resposta().value).toBe("");
    expect(screen.getByRole("button", { name: "IA" })).toBeEnabled();
  });

  it("não chama a IA para a resposta se o modal foi desmontado durante a geração da pergunta", async () => {
    let resolveQuestion: (value: { ok: true; text: string }) => void = () => {};
    vi.mocked(generateCardQuestion).mockReturnValue(new Promise((resolve) => { resolveQuestion = resolve; }));
    const { user, unmount } = renderModal();

    await user.click(screen.getByRole("button", { name: "IA" }));
    await waitFor(() => expect(generateCardQuestion).toHaveBeenCalledTimes(1));

    unmount();
    resolveQuestion({ ok: true, text: "Pergunta gerada?" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(generateCardAnswer).not.toHaveBeenCalled();
  });

  it("desabilita Salvar enquanto a IA está gerando e o reabilita depois", async () => {
    let resolveAnswer: (value: { ok: true; text: string }) => void = () => {};
    vi.mocked(generateCardAnswer).mockReturnValue(new Promise((resolve) => { resolveAnswer = resolve; }));
    const { user } = renderModal();

    await user.click(screen.getByRole("button", { name: "IA" }));

    expect(await screen.findByRole("button", { name: "Gerando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();

    resolveAnswer({ ok: true, text: "Resposta gerada." });
    await waitFor(() => expect(resposta().value).toBe("Resposta gerada."));
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "IA" })).toBeEnabled();
  });
});
