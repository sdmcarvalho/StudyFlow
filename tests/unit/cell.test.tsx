import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { Cell } from "@/features/estudo/editor/components/Cell";

type Props = ComponentProps<typeof Cell>;

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    cell: { id: "c1", texto: "**forte**" },
    index: 0,
    total: 3,
    mode: "default",
    editing: false,
    studyId: "S1",
    onEdit: vi.fn(),
    onStopEditing: vi.fn(),
    onChange: vi.fn(),
    onAddBelow: vi.fn(),
    onDelete: vi.fn(),
    registerTextarea: vi.fn(),
    ...overrides,
  };
}

function setup(overrides: Partial<Props> = {}) {
  const props = makeProps(overrides);
  const utils = render(<Cell {...props} />);
  return { ...utils, props };
}

describe("Cell — modo padrão", () => {
  it("mostra o Markdown renderizado sem textarea", () => {
    const { container } = setup();
    expect(container.querySelector("strong")).toHaveTextContent("forte");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("célula vazia mostra o aviso", () => {
    setup({ cell: { id: "c1", texto: "" } });
    expect(screen.getByText("Célula vazia. Clique para editar.")).toBeInTheDocument();
  });

  it("clicar e Enter com a célula focada chamam onEdit(id)", async () => {
    const { props } = setup();
    const view = screen.getByRole("button", { name: /editar célula/i });
    await userEvent.click(view);
    expect(props.onEdit).toHaveBeenCalledWith("c1");

    view.focus();
    await userEvent.keyboard("{Enter}");
    expect(props.onEdit).toHaveBeenCalledTimes(2);
  });

  it("em edição mostra a textarea com o texto e o resultado ao vivo; Esc para a edição", async () => {
    const { props, container } = setup({ editing: true });
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveValue("**forte**");
    expect(container.querySelector("strong")).toHaveTextContent("forte");
    // Entra em edição com o foco no texto e o cursor no fim.
    expect(textarea).toHaveFocus();
    expect((textarea as HTMLTextAreaElement).selectionStart).toBe(9);

    await userEvent.keyboard("{Escape}");
    expect(props.onStopEditing).toHaveBeenCalledTimes(1);
  });

  it("digitar chama onChange(id, texto)", async () => {
    const onChange = vi.fn();
    function Harness() {
      const [texto, setTexto] = useState("");
      return (
        <Cell
          {...makeProps({ editing: true, cell: { id: "c1", texto } })}
          onChange={(id, value) => {
            onChange(id, value);
            setTexto(value);
          }}
        />
      );
    }
    render(<Harness />);
    await userEvent.type(screen.getByRole("textbox"), "oi");
    expect(onChange).toHaveBeenLastCalledWith("c1", "oi");
  });

  it("perder o foco para fora da célula para a edição; para dentro, não", async () => {
    const props = makeProps({ editing: true });
    render(
      <>
        <Cell {...props} />
        <button type="button">fora</button>
      </>,
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.blur(textarea, { relatedTarget: screen.getByRole("button", { name: "Excluir célula" }) });
    expect(props.onStopEditing).not.toHaveBeenCalled();

    fireEvent.blur(textarea, { relatedTarget: screen.getByRole("button", { name: "fora" }) });
    expect(props.onStopEditing).toHaveBeenCalledTimes(1);
  });

  it("registra a textarea e a desregistra ao sair da edição", () => {
    const props = makeProps({ editing: true });
    const { rerender } = render(<Cell {...props} />);
    expect(props.registerTextarea).toHaveBeenLastCalledWith("c1", screen.getByRole("textbox"));

    rerender(<Cell {...props} editing={false} />);
    expect(props.registerTextarea).toHaveBeenLastCalledWith("c1", null);
  });

  it("Adicionar célula abaixo e Excluir célula chamam as callbacks com o id", async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Adicionar célula abaixo" }));
    expect(props.onAddBelow).toHaveBeenCalledWith("c1");
    await userEvent.click(screen.getByRole("button", { name: "Excluir célula" }));
    expect(props.onDelete).toHaveBeenCalledWith("c1");
    expect(props.onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Arrastar célula" })).toBeInTheDocument();
  });

  it("tem role group com nome Célula N de M", () => {
    setup({ index: 1, total: 4 });
    expect(screen.getByRole("group", { name: "Célula 2 de 4" })).toBeInTheDocument();
  });
});

describe("Cell — modos dividida e preview", () => {
  it("split mostra textarea e resultado mesmo sem edição", () => {
    const { container } = setup({ mode: "split" });
    expect(screen.getByRole("textbox")).toHaveValue("**forte**");
    expect(container.querySelector("strong")).toHaveTextContent("forte");
  });

  it("preview mostra só o resultado, sem textarea, alça, lixeira nem +", async () => {
    const { container, props } = setup({ mode: "preview" });
    const group = screen.getByRole("group", { name: "Célula 1 de 3" });
    expect(container.querySelector("strong")).toHaveTextContent("forte");
    expect(within(group).queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arrastar célula" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir célula" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar célula abaixo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar célula/i })).not.toBeInTheDocument();
    await userEvent.click(container.querySelector("strong")!);
    expect(props.onEdit).not.toHaveBeenCalled();
  });
});
