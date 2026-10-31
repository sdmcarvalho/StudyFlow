import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/cards/actions", () => ({
  recordCardResult: vi.fn(),
  getCardAccuracy: vi.fn(),
  updateLastTested: vi.fn(),
}));
vi.mock("@/features/agenda/actions", () => ({
  completeSchedule: vi.fn(),
  checkStudyHasActiveSchedules: vi.fn(),
  createSchedules: vi.fn(),
}));

import { checkStudyHasActiveSchedules, completeSchedule, createSchedules } from "@/features/agenda/actions";
import { getCardAccuracy, recordCardResult, updateLastTested } from "@/features/cards/actions";
import { TestModal } from "@/features/cards/components/TestModal";

const card = (id: string) => ({ id, pergunta: `Pergunta ${id}`, resposta: `Resposta ${id}` });

const fetchMock = vi.fn();
const onClose = vi.fn();

function mockCards(cards: ReturnType<typeof card>[]) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => cards });
}

async function renderModal(props: { scheduleId?: string | null } = {}) {
  render(<TestModal studyId="S1" studyName="Estudo S1" mode="all" onClose={onClose} {...props} />);
  await screen.findByText("Pergunta C1");
}

async function answer(label: "Acertei" | "Errei") {
  await userEvent.click(screen.getByRole("button", { name: "Ver resposta" }));
  await userEvent.click(screen.getByRole("button", { name: label }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  mockCards([card("C1")]);
  vi.mocked(recordCardResult).mockResolvedValue({ ok: true, data: undefined });
  vi.mocked(getCardAccuracy).mockResolvedValue({ ok: true, data: { accuracyPercent: 50, attempts: 2 } });
  vi.mocked(updateLastTested).mockResolvedValue({ ok: true, data: undefined });
  vi.mocked(completeSchedule).mockResolvedValue({ ok: true, data: undefined });
  vi.mocked(checkStudyHasActiveSchedules).mockResolvedValue(false);
  vi.mocked(createSchedules).mockResolvedValue({ ok: true, data: { count: 6, hasActive: false } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TestModal", () => {
  it("registra o resultado e depois consulta a precisão do card", async () => {
    await renderModal();
    await answer("Errei");

    expect(recordCardResult).toHaveBeenCalledWith("C1", "S1", false);
    expect(getCardAccuracy).toHaveBeenCalledWith("C1");
    expect(vi.mocked(recordCardResult).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getCardAccuracy).mock.invocationCallOrder[0],
    );
    expect(await screen.findByText("Errou")).toBeInTheDocument();
    expect(screen.getByText(/Precisão histórica: 50\.0%/)).toBeInTheDocument();
  });

  it("mostra a falha de recordCardResult em role=alert e não marca o card como avaliado", async () => {
    vi.mocked(recordCardResult).mockResolvedValue({ ok: false, message: "Não foi possível salvar o resultado." });
    await renderModal();
    await answer("Acertei");

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar o resultado.");
    expect(getCardAccuracy).not.toHaveBeenCalled();
    expect(screen.queryByText("Acertou")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalizar" })).not.toBeInTheDocument();
    // Pode tentar de novo.
    expect(screen.getByRole("button", { name: "Acertei" })).toBeInTheDocument();
  });

  it("limpa o erro ao tentar novamente com sucesso", async () => {
    vi.mocked(recordCardResult).mockResolvedValueOnce({ ok: false, message: "Falhou." });
    await renderModal();
    await answer("Acertei");
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Acertei" }));
    expect(await screen.findByText("Acertou")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ao finalizar chama updateLastTested e completeSchedule quando há agendamento", async () => {
    await renderModal({ scheduleId: "A1" });
    await answer("Acertei");
    await userEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    expect(await screen.findByRole("heading", { name: "Teste Concluído" })).toBeInTheDocument();
    expect(updateLastTested).toHaveBeenCalledWith("S1");
    expect(completeSchedule).toHaveBeenCalledWith("A1");
    expect(screen.queryByText(/não foi possível registrar/)).not.toBeInTheDocument();
  });

  it("não chama completeSchedule sem scheduleId", async () => {
    await renderModal({ scheduleId: null });
    await answer("Acertei");
    await userEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    expect(await screen.findByRole("heading", { name: "Teste Concluído" })).toBeInTheDocument();
    expect(updateLastTested).toHaveBeenCalledTimes(1);
    expect(completeSchedule).not.toHaveBeenCalled();
  });

  it("mantém a tela de conclusão e avisa quando updateLastTested falha", async () => {
    vi.mocked(updateLastTested).mockResolvedValue({ ok: false, message: "Erro." });
    await renderModal({ scheduleId: "A1" });
    await answer("Acertei");
    await userEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    expect(await screen.findByRole("heading", { name: "Teste Concluído" })).toBeInTheDocument();
    expect(screen.getByText(/Teste concluído, mas não foi possível registrar o resultado no histórico\/na agenda\./)).toBeInTheDocument();
  });

  it("mantém a tela de conclusão e avisa quando completeSchedule falha", async () => {
    vi.mocked(completeSchedule).mockResolvedValue({ ok: false, message: "Erro." });
    await renderModal({ scheduleId: "A1" });
    await answer("Acertei");
    await userEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    expect(await screen.findByRole("heading", { name: "Teste Concluído" })).toBeInTheDocument();
    expect(screen.getByText(/Teste concluído, mas não foi possível registrar o resultado no histórico\/na agenda\./)).toBeInTheDocument();
  });

  it("mantém a tela de conclusão quando as ações lançam exceção", async () => {
    vi.mocked(updateLastTested).mockRejectedValue(new Error("rede"));
    await renderModal({ scheduleId: "A1" });
    await answer("Acertei");
    await userEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    expect(await screen.findByRole("heading", { name: "Teste Concluído" })).toBeInTheDocument();
    expect(screen.getByText(/não foi possível registrar o resultado/)).toBeInTheDocument();
    expect(completeSchedule).toHaveBeenCalledWith("A1");
  });

  it("não chama as ações duas vezes com dois cliques em Finalizar", async () => {
    let release!: () => void;
    vi.mocked(updateLastTested).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ ok: true, data: undefined });
      }),
    );
    await renderModal({ scheduleId: "A1" });
    await answer("Acertei");

    const finish = screen.getByRole("button", { name: "Finalizar" });
    // Os dois cliques no mesmo act: só o guarda por ref (busyRef) impede a segunda chamada.
    act(() => {
      finish.click();
      finish.click();
    });
    await act(async () => release());

    expect(await screen.findByRole("heading", { name: "Teste Concluído" })).toBeInTheDocument();
    expect(updateLastTested).toHaveBeenCalledTimes(1);
    expect(completeSchedule).toHaveBeenCalledTimes(1);
  });

  it("não deixa fechar (×, overlay) enquanto o salvamento final roda", async () => {
    let release!: () => void;
    vi.mocked(updateLastTested).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ ok: true, data: undefined });
      }),
    );
    const { container } = render(<TestModal studyId="S1" studyName="Estudo S1" mode="all" onClose={onClose} />);
    await screen.findByText("Pergunta C1");
    await answer("Acertei");
    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    expect(screen.getByRole("button", { name: "Fechar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(container.firstElementChild as Element);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => release());
    expect(await screen.findByRole("heading", { name: "Teste Concluído" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Fechar" })[0]).toBeEnabled();
  });

  describe("Agendar revisões", () => {
    async function finishTest() {
      await renderModal();
      await answer("Acertei");
      await userEvent.click(screen.getByRole("button", { name: "Finalizar" }));
      await screen.findByRole("heading", { name: "Teste Concluído" });
    }

    it("sem agendamentos ativos abre o modal sem aviso e cria com force: false", async () => {
      await finishTest();
      await userEvent.click(screen.getByRole("button", { name: "Agendar revisões" }));

      expect(checkStudyHasActiveSchedules).toHaveBeenCalledWith("S1");
      const dialog = await screen.findByRole("dialog", { name: "Confirmar Agendamentos" });
      expect(dialog).not.toHaveTextContent(/já possui/);

      await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

      expect(createSchedules).toHaveBeenCalledWith({ studyId: "S1", studyName: "Estudo S1", force: false });
      expect(await screen.findByText("Agendamentos criados.")).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Confirmar Agendamentos" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Agendar revisões" })).toBeDisabled();
    });

    it("com agendamentos ativos abre o modal com aviso e cria com force: true", async () => {
      vi.mocked(checkStudyHasActiveSchedules).mockResolvedValue(true);
      await finishTest();
      await userEvent.click(screen.getByRole("button", { name: "Agendar revisões" }));

      const dialog = await screen.findByRole("dialog", { name: "Confirmar Agendamentos" });
      expect(dialog).toHaveTextContent(/já possui agendamentos ativos/);

      await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

      expect(createSchedules).toHaveBeenCalledWith({ studyId: "S1", studyName: "Estudo S1", force: true });
      expect(await screen.findByText("Agendamentos criados.")).toBeInTheDocument();
    });

    it("não verifica os agendamentos duas vezes com dois cliques rápidos em Agendar revisões", async () => {
      let release!: () => void;
      vi.mocked(checkStudyHasActiveSchedules).mockReturnValue(
        new Promise((resolve) => {
          release = () => resolve(false);
        }),
      );
      await finishTest();

      // Os dois cliques no mesmo act: só o guarda por ref (checkingRef) barra o segundo.
      const button = screen.getByRole("button", { name: "Agendar revisões" });
      act(() => {
        button.click();
        button.click();
      });
      await act(async () => release());

      expect(checkStudyHasActiveSchedules).toHaveBeenCalledTimes(1);
      expect(await screen.findByRole("dialog", { name: "Confirmar Agendamentos" })).toBeInTheDocument();
    });

    it("mostra a mensagem de createSchedules no modal quando falha", async () => {
      vi.mocked(createSchedules).mockResolvedValue({ ok: false, message: "Estudo não encontrado." });
      await finishTest();
      await userEvent.click(screen.getByRole("button", { name: "Agendar revisões" }));
      await userEvent.click(await screen.findByRole("button", { name: "Confirmar" }));

      const dialog = screen.getByRole("dialog", { name: "Confirmar Agendamentos" });
      expect(dialog).toHaveTextContent("Estudo não encontrado.");
      expect(screen.queryByText("Agendamentos criados.")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Agendar revisões" })).toBeEnabled();
    });

    it("mostra erro e não abre o modal quando checkStudyHasActiveSchedules lança", async () => {
      vi.mocked(checkStudyHasActiveSchedules).mockRejectedValue(new Error("sessão"));
      await finishTest();
      await userEvent.click(screen.getByRole("button", { name: "Agendar revisões" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível/);
      expect(screen.queryByRole("dialog", { name: "Confirmar Agendamentos" })).not.toBeInTheDocument();
      expect(createSchedules).not.toHaveBeenCalled();
    });
  });
});
