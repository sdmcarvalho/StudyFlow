import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/estudo/actions", () => ({
  createStudyRecord: vi.fn(),
  updateStudyRecord: vi.fn(),
  deleteStudyRecord: vi.fn(),
  restoreStudyRecord: vi.fn(),
}));

import { createStudyRecord, deleteStudyRecord } from "@/features/estudo/actions";
import { StudyView } from "@/features/estudo/components/StudyView";
import { buildListPage, type StudyRecordRow } from "@/features/estudo/list";

const rows: StudyRecordRow[] = [
  { id: "1", descricao: "Física II", pasta: "C:\\Estudos\\Física", dataInicial: "2026-09-01", dataAtualizacao: "2026-10-14" },
  { id: "2", descricao: "Anatomia", pasta: "C:\\Estudos\\Medicina", dataInicial: "2026-08-11", dataAtualizacao: "2026-10-20" },
];

const BASE_DIR = "D:\\Base";

function view(q: string) {
  return <StudyView page={buildListPage(rows, { q, page: 1 })} q={q} baseDir={BASE_DIR} />;
}

const searchbox = () => screen.getByRole("searchbox") as HTMLInputElement;
const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";

beforeEach(() => {
  router.replace.mockReset();
  router.push.mockReset();
  vi.mocked(createStudyRecord).mockReset();
  vi.mocked(deleteStudyRecord).mockReset();
});

describe("StudyView: busca sincronizada com a URL", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("digitar atualiza a URL depois de 250 ms de pausa", () => {
    render(view(""));
    fireEvent.change(searchbox(), { target: { value: "fis" } });
    act(() => vi.advanceTimersByTime(249));
    expect(router.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(router.replace).toHaveBeenCalledWith("/estudo?q=fis");
  });

  it("quando q muda por fora (menu, Voltar), o campo acompanha e a busca antiga não volta à URL", () => {
    const { rerender } = render(view("fis"));
    expect(searchbox().value).toBe("fis");

    rerender(view(""));
    expect(searchbox().value).toBe("");
    act(() => vi.advanceTimersByTime(500));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("a resposta do servidor a uma busca já enviada não apaga o que o usuário continuou digitando", () => {
    const { rerender } = render(view(""));
    fireEvent.change(searchbox(), { target: { value: "fi" } });
    act(() => vi.advanceTimersByTime(250));
    expect(router.replace).toHaveBeenCalledWith("/estudo?q=fi");

    fireEvent.change(searchbox(), { target: { value: "fis" } });
    rerender(view("fi"));
    expect(searchbox().value).toBe("fis");
  });
});

describe("StudyView: campo Pasta do modal", () => {
  it("novo Estudo começa com <baseDir>\\ e o que o usuário digita completa o caminho", async () => {
    vi.mocked(createStudyRecord).mockResolvedValue({ ok: true, data: { id: "3" } });
    render(view(""));

    await userEvent.click(screen.getAllByRole("button", { name: "Novo" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Novo registro" });
    const pasta = within(dialog).getByLabelText("Pasta") as HTMLInputElement;
    expect(pasta.value).toBe("D:\\Base\\");

    await userEvent.type(within(dialog).getByLabelText("Descrição"), "Estatística");
    await userEvent.type(pasta, "Estatística");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(createStudyRecord).toHaveBeenCalledWith(expect.objectContaining({ pasta: "D:\\Base\\Estatística" }));
  });

  it("editar mostra a pasta do próprio registro", async () => {
    render(view(""));
    await userEvent.click(screen.getAllByRole("button", { name: "Editar registro" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Editar registro" });
    expect((within(dialog).getByLabelText("Pasta") as HTMLInputElement).value).toBe("C:\\Estudos\\Física");
  });
});

describe("StudyView: falha na chamada da server action", () => {
  it("salvar: o toast de erro aparece, o modal continua aberto e Salvar volta a ficar ativo", async () => {
    vi.mocked(createStudyRecord).mockRejectedValue(new Error("network"));
    render(view(""));

    await userEvent.click(screen.getAllByRole("button", { name: "Novo" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Novo registro" });
    await userEvent.type(within(dialog).getByLabelText("Descrição"), "Estatística");
    await userEvent.type(within(dialog).getByLabelText("Pasta"), "Matemática");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("status")).toHaveTextContent(GENERIC_ERROR);
    expect(screen.getByRole("dialog", { name: "Novo registro" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  it("excluir: o toast de erro aparece, o diálogo fecha e o próximo Excluir não fica travado", async () => {
    vi.mocked(deleteStudyRecord).mockRejectedValue(new Error("network"));
    render(view(""));

    await userEvent.click(screen.getAllByRole("button", { name: "Excluir registro" })[0]);
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByRole("status")).toHaveTextContent(GENERIC_ERROR);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Excluir registro" })[0]);
    expect(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Excluir" })).toBeEnabled();
  });
});
