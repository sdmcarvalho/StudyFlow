import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { CellList } from "@/features/estudo/editor/components/CellList";

type Props = ComponentProps<typeof CellList>;

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    cells: [
      { id: "a", texto: "primeira" },
      { id: "b", texto: "segunda" },
      { id: "c", texto: "terceira" },
    ],
    mode: "default",
    editingId: null,
    studyId: "S1",
    onEdit: vi.fn(),
    onStopEditing: vi.fn(),
    onChange: vi.fn(),
    onAddBelow: vi.fn(),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
    registerTextarea: vi.fn(),
    ...overrides,
  };
  const utils = render(<CellList {...props} />);
  return { ...utils, props };
}

describe("CellList", () => {
  it("renderiza cada célula como grupo Célula N de M", () => {
    setup();
    expect(screen.getByRole("group", { name: "Célula 1 de 3" })).toHaveTextContent("primeira");
    expect(screen.getByRole("group", { name: "Célula 3 de 3" })).toHaveTextContent("terceira");
    expect(screen.getAllByRole("button", { name: "Arrastar célula" })).toHaveLength(3);
  });

  it("só a célula em edição mostra a textarea", () => {
    setup({ editingId: "b" });
    expect(screen.getByRole("textbox")).toHaveValue("segunda");
  });

  it("repassa as callbacks com o id da célula", async () => {
    const { props } = setup();
    await userEvent.click(screen.getAllByRole("button", { name: "Excluir célula" })[1]!);
    expect(props.onDelete).toHaveBeenCalledWith("b");
    await userEvent.click(screen.getAllByRole("button", { name: "Adicionar célula abaixo" })[2]!);
    expect(props.onAddBelow).toHaveBeenCalledWith("c");
  });

  it("repassa onFocusCell com o id da célula focada", async () => {
    const onFocusCell = vi.fn();
    setup({ mode: "split", onFocusCell });
    const textareas = screen.getAllByRole("textbox");
    expect(textareas).toHaveLength(3);
    await userEvent.click(textareas[1]!);
    expect(onFocusCell).toHaveBeenLastCalledWith("b");
  });

  it("no preview não há alças", () => {
    setup({ mode: "preview" });
    expect(screen.queryByRole("button", { name: "Arrastar célula" })).not.toBeInTheDocument();
  });

  it("trocar para o preview e voltar não remonta as células", () => {
    const { props, rerender } = setup();
    const before = screen.getByRole("group", { name: "Célula 2 de 3" });
    rerender(<CellList {...props} mode="preview" />);
    expect(screen.getByRole("group", { name: "Célula 2 de 3" })).toBe(before);
    rerender(<CellList {...props} mode="split" />);
    expect(screen.getByRole("group", { name: "Célula 2 de 3" })).toBe(before);
  });

  it("no preview nenhuma célula fica em edição, mesmo com editingId", () => {
    setup({ mode: "preview", editingId: "b" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("reordena pelo teclado: Espaço pega, seta para baixo move, Espaço solta", async () => {
    // O jsdom não tem layout: cada célula ganha uma caixa empilhada para o dnd-kit medir.
    const original = Element.prototype.getBoundingClientRect;
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const match = /^Célula (\d+) de \d+$/.exec(this.getAttribute("aria-label") ?? "");
      if (!match) return original.call(this);
      const top = (Number(match[1]) - 1) * 100;
      return { x: 0, y: top, top, left: 0, right: 600, bottom: top + 90, width: 600, height: 90, toJSON: () => ({}) };
    });
    onTestFinished(() => spy.mockRestore());

    const { props } = setup();
    const handle = screen.getAllByRole("button", { name: "Arrastar célula" })[0]!;
    handle.focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard(" ");
    expect(props.onReorder).toHaveBeenCalledWith(0, 1);
  });
});
