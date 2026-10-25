import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Cell } from "@/features/estudo/editor/components/Cell";
import { uploadImage } from "@/features/estudo/editor/upload";

vi.mock("@/features/estudo/editor/upload", () => ({ uploadImage: vi.fn() }));

const uploadMock = vi.mocked(uploadImage);

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

/** A área focável da célula renderizada: a que é descrita pela dica de edição. */
function getView(groupName: string): HTMLElement {
  const group = screen.getByRole("group", { name: groupName });
  const view = group.querySelector<HTMLElement>("[aria-describedby]");
  if (!view) throw new Error("área focável não encontrada");
  return view;
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
    const view = getView("Célula 1 de 3");
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

  it("a célula renderizada expõe o conteúdo e não é um botão", () => {
    setup({ cell: { id: "c1", texto: "# Título\n\n- item\n\n[site](https://exemplo.com)" } });
    const group = screen.getByRole("group", { name: "Célula 1 de 3" });
    expect(within(group).getByRole("heading", { name: "Título" })).toBeInTheDocument();
    expect(within(group).getByRole("listitem")).toHaveTextContent("item");
    expect(within(group).getByRole("link", { name: "site" })).toBeInTheDocument();
    expect(within(group).queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
  });

  it("a área focável tem a dica de edição como descrição", () => {
    setup();
    const view = getView("Célula 1 de 3");
    expect(view).toHaveAttribute("tabindex", "0");
    expect(view).not.toHaveAttribute("role");
    expect(view).not.toHaveAttribute("aria-label");
    expect(view).toHaveAccessibleDescription("Pressione Enter para editar");
  });

  it("Enter num link interno e clique no link não abrem a edição", async () => {
    const { props } = setup({ cell: { id: "c1", texto: "[site](https://exemplo.com)" } });
    const link = screen.getByRole("link", { name: "site" });
    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);
    link.focus();
    await userEvent.keyboard("{Enter}");
    expect(props.onEdit).not.toHaveBeenCalled();
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
    expect(group.querySelector("[aria-describedby]")).toBeNull();
    expect(group.querySelector("[tabindex='0']")).toBeNull();
    await userEvent.click(container.querySelector("strong")!);
    expect(props.onEdit).not.toHaveBeenCalled();
  });
});

describe("Cell — foco da textarea", () => {
  it("no modo dividido, focar a textarea chama onFocusCell(id)", async () => {
    const onFocusCell = vi.fn();
    setup({ mode: "split", onFocusCell });
    await userEvent.click(screen.getByRole("textbox"));
    expect(onFocusCell).toHaveBeenCalledWith("c1");
  });

  it("no modo padrão em edição, focar a textarea chama onFocusCell(id)", () => {
    const onFocusCell = vi.fn();
    setup({ editing: true, onFocusCell });
    // O efeito de entrada em edição já foca a textarea.
    expect(onFocusCell).toHaveBeenCalledWith("c1");
  });

  it("entrar em edição com a textarea já focada não leva o cursor para o fim", () => {
    const props = makeProps({ mode: "split", cell: { id: "c1", texto: "abcdef" } });
    const { rerender } = render(<Cell {...props} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(2, 2);

    rerender(<Cell {...props} editing />);
    expect(textarea).toHaveFocus();
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(2);
  });
});

describe("Cell — colar e soltar imagem", () => {
  const ok = { ok: true as const, path: "imagens/foto-20261025-101530.png", alt: "foto" };

  function png(name = "foto.png"): File {
    return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
  }

  function editor(texto: string, caret: number, overrides: Partial<Props> = {}) {
    const props = makeProps({ mode: "split", cell: { id: "c1", texto }, ...overrides });
    render(<Cell {...props} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    return { props, textarea };
  }

  beforeEach(() => {
    uploadMock.mockReset();
  });

  it("colar um arquivo de imagem envia e insere o Markdown na posição do cursor", async () => {
    uploadMock.mockResolvedValue(ok);
    const { props, textarea } = editor("abcd", 2);
    const file = png();
    const notCanceled = fireEvent.paste(textarea, { clipboardData: { files: [file], types: ["Files"] } });

    expect(notCanceled).toBe(false);
    expect(uploadMock).toHaveBeenCalledWith("S1", file);
    const md = "![foto](imagens/foto-20261025-101530.png)";
    await waitFor(() => expect(props.onChange).toHaveBeenCalledWith("c1", `ab${md}cd`));
    expect(textarea.selectionStart).toBe(2 + md.length);
    expect(textarea.selectionEnd).toBe(2 + md.length);
  });

  it("colar troca o trecho selecionado pela imagem", async () => {
    uploadMock.mockResolvedValue(ok);
    const { props, textarea } = editor("abcd", 0);
    textarea.setSelectionRange(1, 3);
    fireEvent.paste(textarea, { clipboardData: { files: [png()], types: ["Files"] } });
    await waitFor(() =>
      expect(props.onChange).toHaveBeenCalledWith("c1", "a![foto](imagens/foto-20261025-101530.png)d"),
    );
  });

  it("colar texto ou arquivo que não é imagem segue o padrão do navegador", () => {
    const { textarea } = editor("abcd", 2);
    expect(fireEvent.paste(textarea, { clipboardData: { files: [], types: ["text/plain"] } })).toBe(true);
    const pdf = new File(["%PDF"], "a.pdf", { type: "application/pdf" });
    expect(fireEvent.paste(textarea, { clipboardData: { files: [pdf], types: ["Files"] } })).toBe(true);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("soltar um arquivo de imagem envia e insere", async () => {
    uploadMock.mockResolvedValue(ok);
    const { props, textarea } = editor("abcd", 4);
    const file = png();
    expect(fireEvent.dragOver(textarea, { dataTransfer: { files: [file], types: ["Files"] } })).toBe(false);
    expect(fireEvent.drop(textarea, { dataTransfer: { files: [file], types: ["Files"] } })).toBe(false);
    expect(uploadMock).toHaveBeenCalledWith("S1", file);
    await waitFor(() =>
      expect(props.onChange).toHaveBeenCalledWith("c1", "abcd![foto](imagens/foto-20261025-101530.png)"),
    );
  });

  it("arrastar texto para a textarea segue o padrão do navegador", () => {
    const { textarea } = editor("abcd", 4);
    expect(fireEvent.dragOver(textarea, { dataTransfer: { files: [], types: ["text/plain"] } })).toBe(true);
    expect(fireEvent.drop(textarea, { dataTransfer: { files: [], types: ["text/plain"] } })).toBe(true);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("soltar arquivo que não é imagem não envia nem deixa o navegador abrir o arquivo", () => {
    const { textarea } = editor("abcd", 4);
    const pdf = new File(["%PDF"], "a.pdf", { type: "application/pdf" });
    expect(fireEvent.drop(textarea, { dataTransfer: { files: [pdf], types: ["Files"] } })).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("se a edição terminar durante o envio, a imagem entra no fim da célula", async () => {
    let resolve!: (value: typeof ok) => void;
    uploadMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const props = makeProps({ editing: true, cell: { id: "c1", texto: "abcd" } });
    const { rerender } = render(<Cell {...props} />);
    fireEvent.paste(screen.getByRole("textbox"), { clipboardData: { files: [png()], types: ["Files"] } });
    rerender(<Cell {...props} editing={false} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    resolve(ok);
    await waitFor(() =>
      expect(props.onChange).toHaveBeenCalledWith("c1", "abcd\n\n![foto](imagens/foto-20261025-101530.png)"),
    );
  });

  it("falha no envio chama onImageError com a mensagem e não insere", async () => {
    uploadMock.mockResolvedValue({ ok: false, message: "Não foi possível salvar a imagem." });
    const onImageError = vi.fn();
    const { props, textarea } = editor("abcd", 2, { onImageError });
    fireEvent.paste(textarea, { clipboardData: { files: [png()], types: ["Files"] } });
    await waitFor(() => expect(onImageError).toHaveBeenCalledWith("Não foi possível salvar a imagem."));
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("o alt vindo do servidor não quebra o Markdown", async () => {
    uploadMock.mockResolvedValue({ ok: true, path: "imagens/x.png", alt: "a]b|c\nd" });
    const { props, textarea } = editor("", 0);
    fireEvent.paste(textarea, { clipboardData: { files: [png()], types: ["Files"] } });
    await waitFor(() => expect(props.onChange).toHaveBeenCalledWith("c1", "![a b c d](imagens/x.png)"));
  });
});
