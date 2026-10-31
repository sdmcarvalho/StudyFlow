import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/agenda/actions", () => ({ deleteSchedule: vi.fn() }));

import { deleteSchedule } from "@/features/agenda/actions";
import { ScheduleList } from "@/features/agenda/components/ScheduleList";
import type { ScheduleRow } from "@/features/agenda/types";

const row = (id: string, status: string): ScheduleRow => ({
  id,
  studyId: "S1",
  studyName: `Estudo ${id}`,
  reviewDate: "2026-11-01",
  createdAt: "2026-10-31",
  session: "24 horas",
  status,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteSchedule).mockResolvedValue({ ok: true, data: undefined });
});

describe("ScheduleList", () => {
  it("mostra Fazer como link com study e schedule só para agendamentos Ativos", () => {
    render(<ScheduleList schedules={[row("A1", "Ativo"), row("A2", "Realizado")]} />);
    const links = screen.getAllByRole("link", { name: /^Fazer teste de/ });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Fazer teste de Estudo A1");
    expect(links[0]).toHaveAttribute("href", "/testes?study=S1&schedule=A1");
  });

  it("mostra Excluir em todas as linhas, Ativas e Realizadas", () => {
    render(<ScheduleList schedules={[row("A1", "Ativo"), row("A2", "Realizado")]} />);
    expect(screen.getByRole("button", { name: "Excluir agendamento de Estudo A1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Excluir agendamento de Estudo A2" })).toBeVisible();
  });

  it("clicar em Excluir só abre a confirmação, sem apagar", async () => {
    const user = userEvent.setup();
    render(<ScheduleList schedules={[row("A1", "Ativo")]} />);
    await user.click(screen.getByRole("button", { name: "Excluir agendamento de Estudo A1" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Estudo A1/)).toBeVisible();
    expect(within(dialog).getByText(/não pode ser desfeita/)).toBeVisible();
    expect(deleteSchedule).not.toHaveBeenCalled();
  });

  it("Cancelar fecha a confirmação sem apagar", async () => {
    const user = userEvent.setup();
    render(<ScheduleList schedules={[row("A1", "Ativo")]} />);
    await user.click(screen.getByRole("button", { name: "Excluir agendamento de Estudo A1" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(deleteSchedule).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("confirmar apaga o agendamento escolhido, fecha e atualiza a página", async () => {
    const user = userEvent.setup();
    render(<ScheduleList schedules={[row("A1", "Ativo"), row("A2", "Realizado")]} />);
    await user.click(screen.getByRole("button", { name: "Excluir agendamento de Estudo A2" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(deleteSchedule).toHaveBeenCalledTimes(1);
    expect(deleteSchedule).toHaveBeenCalledWith("A2");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("mostra a mensagem de erro, mantém a confirmação aberta e não atualiza a página", async () => {
    vi.mocked(deleteSchedule).mockResolvedValue({ ok: false, message: "Agendamento não encontrado." });
    const user = userEvent.setup();
    render(<ScheduleList schedules={[row("A1", "Ativo")]} />);
    await user.click(screen.getByRole("button", { name: "Excluir agendamento de Estudo A1" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Excluir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Agendamento não encontrado.");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("erro inesperado vira mensagem genérica e libera o botão para tentar de novo", async () => {
    vi.mocked(deleteSchedule).mockRejectedValue(new Error("rede"));
    const user = userEvent.setup();
    render(<ScheduleList schedules={[row("A1", "Ativo")]} />);
    await user.click(screen.getByRole("button", { name: "Excluir agendamento de Estudo A1" }));
    const confirm = within(screen.getByRole("alertdialog")).getByRole("button", { name: "Excluir" });
    await user.click(confirm);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível excluir o agendamento.");
    expect(confirm).toBeEnabled();
  });

  it("clique duplo em Excluir chama a ação uma vez só", async () => {
    let resolve!: (v: { ok: true; data: undefined }) => void;
    vi.mocked(deleteSchedule).mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<ScheduleList schedules={[row("A1", "Ativo")]} />);
    await user.click(screen.getByRole("button", { name: "Excluir agendamento de Estudo A1" }));
    const confirm = within(screen.getByRole("alertdialog")).getByRole("button", { name: "Excluir" });
    // Dois cliques no mesmo instante, antes de o React re-renderizar o botão como desabilitado.
    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(deleteSchedule).toHaveBeenCalledTimes(1);
    resolve({ ok: true, data: undefined });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
