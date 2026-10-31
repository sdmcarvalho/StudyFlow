process.env.TZ = "America/Sao_Paulo";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleConfirmModal } from "@/features/agenda/components/ScheduleConfirmModal";
import { REVIEW_SESSIONS, reviewDateFor } from "@/features/agenda/sessions";
import { formatDateBR } from "@/lib/dates";

const onClose = vi.fn();

function renderModal(props: Partial<React.ComponentProps<typeof ScheduleConfirmModal>> = {}) {
  const onConfirm = props.onConfirm ?? vi.fn().mockResolvedValue({ ok: true });
  render(
    <ScheduleConfirmModal open studyId="S1" studyName="Estudo S1" onClose={onClose} onConfirm={onConfirm} {...props} />,
  );
  return onConfirm;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 31, 23, 30));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ScheduleConfirmModal", () => {
  it("mostra as 6 sessões com datas locais dd/mm/aaaa", () => {
    renderModal();
    const now = new Date();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(6);
    REVIEW_SESSIONS.forEach(({ session, days }, i) => {
      expect(rows[i]).toHaveTextContent(formatDateBR(reviewDateFor(now, days)));
      expect(rows[i]).toHaveTextContent(session);
    });
    expect(rows[0]).toHaveTextContent("31/10/2026");
    expect(rows[1]).toHaveTextContent("01/11/2026");
  });

  it("mostra o aviso quando recebido", () => {
    renderModal({ warning: "Este estudo já possui agendamentos ativos." });
    expect(screen.getByText("Este estudo já possui agendamentos ativos.")).toBeInTheDocument();
  });

  it("chama onConfirm uma vez mesmo com dois cliques rápidos", async () => {
    let release!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          release = () => resolve({ ok: true });
        }),
    );
    renderModal({ onConfirm });

    const button = screen.getByRole("button", { name: "Confirmar" });
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => release());

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("mostra a mensagem e não fecha quando onConfirm devolve ok: false", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: false, message: "Não foi possível criar os agendamentos." });
    renderModal({ onConfirm });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível criar os agendamentos.");
    expect(onClose).not.toHaveBeenCalled();
    // Pode tentar de novo.
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
  });

  it("mostra erro genérico e não fecha quando onConfirm lança", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("rede"));
    renderModal({ onConfirm });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível criar os agendamentos/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("fecha quando onConfirm devolve ok: true", async () => {
    renderModal();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
