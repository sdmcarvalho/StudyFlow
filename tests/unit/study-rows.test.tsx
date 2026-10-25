import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudyCardList } from "@/features/estudo/components/StudyCardList";
import { StudyTable } from "@/features/estudo/components/StudyTable";
import type { StudyRecordRow } from "@/features/estudo/list";

const record: StudyRecordRow = {
  id: "a b/1",
  descricao: "Física II",
  pasta: "C:\\Estudos\\Física",
  dataInicial: "2026-09-01",
  dataAtualizacao: "2026-10-14",
};
const HREF = "/estudo/a%20b%2F1";

const onOpen = vi.fn();
const onEdit = vi.fn();
const onDelete = vi.fn();

// jsdom não implementa navegação: cancela o clique no link já na captura (o link para a propagação, então o document não o veria), sem ruído no log.
const cancelLinkNavigation = (event: Event) => {
  if ((event.target as Element).closest("a")) event.preventDefault();
};

beforeEach(() => {
  onOpen.mockReset();
  onEdit.mockReset();
  onDelete.mockReset();
  document.addEventListener("click", cancelLinkNavigation, true);
});

afterEach(() => document.removeEventListener("click", cancelLinkNavigation, true));

const variants = [
  {
    name: "StudyTable (linha)",
    renderIt: () => render(<StudyTable items={[record]} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />),
    container: () => screen.getAllByRole("row")[1],
    inside: () => screen.getByText("C:\\Estudos\\Física"),
  },
  {
    name: "StudyCardList (card)",
    renderIt: () => render(<StudyCardList items={[record]} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />),
    container: () => screen.getByRole("listitem"),
    inside: () => screen.getByText("C:\\Estudos\\Física"),
  },
];

describe.each(variants)("$name abre o editor", ({ renderIt, container, inside }) => {
  it("clicar em qualquer parte do corpo chama onOpen(record)", async () => {
    renderIt();
    await userEvent.click(inside());
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(record);
  });

  it("clicar na data também abre", async () => {
    renderIt();
    await userEvent.click(screen.getByText("01/09/2026"));
    expect(onOpen).toHaveBeenCalledWith(record);
  });

  it("a Descrição é um link para /estudo/<id> e clicar nele não chama onOpen", async () => {
    renderIt();
    const link = within(container()).getByRole("link", { name: "Física II" });
    expect(link).toHaveAttribute("href", HREF);
    await userEvent.click(link);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("Ctrl/Meta/Shift-clique no link mantém o comportamento do navegador e não chama onOpen", async () => {
    renderIt();
    const link = within(container()).getByRole("link", { name: "Física II" });
    for (const key of ["Control", "Meta", "Shift"]) {
      await userEvent.keyboard(`{${key}>}`);
      await userEvent.click(link);
      await userEvent.keyboard(`{/${key}}`);
    }
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("clique do meio no link não chama onOpen", () => {
    renderIt();
    const link = within(container()).getByRole("link", { name: "Física II" });
    fireEvent.click(link, { button: 1 });
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("Editar chama só onEdit; Excluir chama só onDelete", async () => {
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: "Editar registro" }));
    expect(onEdit).toHaveBeenCalledWith(record);
    await userEvent.click(screen.getByRole("button", { name: "Excluir registro" }));
    expect(onDelete).toHaveBeenCalledWith(record);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("é focável (tabIndex 0) e Enter com o foco no contêiner abre", async () => {
    renderIt();
    const el = container();
    expect(el).toHaveAttribute("tabindex", "0");
    el.focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(record);
  });

  it("Enter nos botões e no link não dispara onOpen pelo contêiner", async () => {
    renderIt();
    screen.getByRole("button", { name: "Editar registro" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onEdit).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Excluir registro" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onDelete).toHaveBeenCalledTimes(1);
    within(container()).getByRole("link", { name: "Física II" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("mantém os nomes acessíveis dos botões", () => {
    renderIt();
    expect(screen.getByRole("button", { name: "Editar registro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir registro" })).toBeInTheDocument();
  });
});

describe("estilo clicável da tabela", () => {
  it("a linha da tabela recebe a classe de cursor pointer", () => {
    render(<StudyTable items={[record]} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getAllByRole("row")[1].className).toMatch(/row/);
  });
});
