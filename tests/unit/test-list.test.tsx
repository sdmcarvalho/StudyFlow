process.env.TZ = "America/Sao_Paulo";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const modalProps = vi.fn();
vi.mock("@/features/cards/components/TestModal", () => ({
  TestModal: (props: { studyName: string; scheduleId?: string | null; onClose: () => void }) => {
    modalProps(props);
    return (
      <div role="dialog" aria-label="modal-teste">
        <button onClick={props.onClose}>fechar-modal</button>
      </div>
    );
  },
}));

import { TestList } from "@/features/cards/components/TestList";
import type { StudyTestSummary } from "@/features/cards/types";

const study = (studyId: string): StudyTestSummary => ({
  studyId,
  studyName: `Estudo ${studyId}`,
  lastCardCreated: new Date(2026, 9, 1, 12, 0).toISOString(),
  lastTested: null,
  totalCards: 4,
  correctAnswers: 0,
  totalAttempts: 0,
  accuracyPercent: null,
});

const studies = [study("S1"), study("S2")];
const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;
const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = scrollIntoView;
});

describe("TestList", () => {
  it("destaca somente a linha do Estudo indicado e rola até ela", () => {
    const { container } = render(<TestList studies={studies} highlightStudyId="S2" />);
    expect(rowOf("Estudo S2")).toHaveAttribute("data-highlighted", "true");
    expect(rowOf("Estudo S1")).not.toHaveAttribute("data-highlighted");
    expect(container.querySelectorAll('[data-highlighted="true"]')).toHaveLength(1);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(rowOf("Estudo S2"));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("sem destaque nenhuma linha é marcada e não rola", () => {
    const { container } = render(<TestList studies={studies} />);
    expect(container.querySelectorAll("[data-highlighted]")).toHaveLength(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("repassa o agendamento ao teste do Estudo destacado", async () => {
    render(<TestList studies={studies} highlightStudyId="S1" scheduleId="A1" />);
    await userEvent.click(within(rowOf("Estudo S1")).getByRole("button", { name: "Todos" }));
    expect(modalProps).toHaveBeenLastCalledWith(expect.objectContaining({ studyName: "Estudo S1", scheduleId: "A1" }));
  });

  it("não repassa o agendamento ao teste de outro Estudo", async () => {
    render(<TestList studies={studies} highlightStudyId="S1" scheduleId="A1" />);
    await userEvent.click(within(rowOf("Estudo S2")).getByRole("button", { name: "Todos" }));
    expect(modalProps).toHaveBeenLastCalledWith(expect.objectContaining({ studyName: "Estudo S2", scheduleId: null }));
  });

  it("atualiza a página ao fechar o modal", async () => {
    render(<TestList studies={studies} />);
    await userEvent.click(within(rowOf("Estudo S1")).getByRole("button", { name: "50%" }));
    expect(router.refresh).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "fechar-modal" }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mostra as datas ISO completas como dd/mm/aaaa locais e — quando não há teste", () => {
    const tested = { ...study("S3"), lastTested: new Date(2026, 8, 10, 12, 0).toISOString() };
    render(<TestList studies={[tested, study("S1")]} />);
    const tested3 = within(rowOf("Estudo S3")).getAllByRole("cell");
    expect(tested3[1]).toHaveTextContent("01/10/2026");
    expect(tested3[2]).toHaveTextContent("10/09/2026");
    expect(within(rowOf("Estudo S1")).getAllByRole("cell")[2]).toHaveTextContent("—");
  });

  it("mostra o estado vazio sem Estudos", () => {
    render(<TestList studies={[]} />);
    expect(screen.getByText("Nenhum estudo com cards cadastrados encontrado.")).toBeInTheDocument();
  });
});
