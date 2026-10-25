import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ImageResizer } from "@/features/estudo/editor/components/ImageResizer";
import { MarkdownView } from "@/features/estudo/editor/components/MarkdownView";
import { setImageWidth } from "@/features/estudo/editor/image-width";

const HANDLE = "Redimensionar imagem";

function drag(handle: HTMLElement, from: number, to: number, finish: "up" | "cancel" | null = "up") {
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: from, clientY: 10, button: 0 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: to, clientY: 12 });
  if (finish === "up") fireEvent.pointerUp(handle, { pointerId: 1, clientX: to, clientY: 12 });
  if (finish === "cancel") fireEvent.pointerCancel(handle, { pointerId: 1 });
}

describe("ImageResizer — sozinho", () => {
  it("arrastar 120 px para a direita de 300 px mostra 420 durante o arrasto e chama onResize(420) só ao soltar", () => {
    const onResize = vi.fn();
    const onLiveWidth = vi.fn();
    render(<ImageResizer width={300} onResize={onResize} onLiveWidth={onLiveWidth} />);
    const handle = screen.getByRole("slider", { name: HANDLE });
    expect(handle).toHaveAttribute("aria-valuenow", "300");

    drag(handle, 100, 220, null);
    expect(onResize).not.toHaveBeenCalled();
    expect(handle).toHaveAttribute("aria-valuenow", "420");
    expect(screen.getByText("420 px")).toBeInTheDocument();
    expect(onLiveWidth).toHaveBeenLastCalledWith(420);

    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 220, clientY: 12 });
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(420);
    expect(onLiveWidth).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText("420 px")).not.toBeInTheDocument();
  });

  it("respeita clampWidth nos dois sentidos", () => {
    const onResize = vi.fn();
    const { rerender } = render(<ImageResizer width={300} onResize={onResize} />);
    drag(screen.getByRole("slider", { name: HANDLE }), 500, -1000);
    expect(onResize).toHaveBeenLastCalledWith(32);

    rerender(<ImageResizer width={1900} onResize={onResize} />);
    drag(screen.getByRole("slider", { name: HANDLE }), 0, 900);
    expect(onResize).toHaveBeenLastCalledWith(2000);
  });

  it("cancelar o ponteiro ou soltar sem mover não chama onResize", () => {
    const onResize = vi.fn();
    render(<ImageResizer width={300} onResize={onResize} />);
    const handle = screen.getByRole("slider", { name: HANDLE });
    drag(handle, 100, 250, "cancel");
    drag(handle, 100, 100);
    expect(onResize).not.toHaveBeenCalled();
    expect(handle).toHaveAttribute("aria-valuenow", "300");
  });

  it("ignora movimento sem botão pressionado", () => {
    const onResize = vi.fn();
    render(<ImageResizer width={300} onResize={onResize} />);
    const handle = screen.getByRole("slider", { name: HANDLE });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 400 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it("teclas + e - na alça mudam 10 px", async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    render(<ImageResizer width={300} onResize={onResize} />);
    screen.getByRole("slider", { name: HANDLE }).focus();
    await user.keyboard("+");
    expect(onResize).toHaveBeenLastCalledWith(310);
    await user.keyboard("-");
    expect(onResize).toHaveBeenLastCalledWith(290);
    await user.keyboard("=");
    expect(onResize).toHaveBeenLastCalledWith(310);
    await user.keyboard("{ArrowRight}");
    expect(onResize).toHaveBeenLastCalledWith(310);
    await user.keyboard("{ArrowLeft}");
    expect(onResize).toHaveBeenLastCalledWith(290);
  });
});

/** MarkdownView com o texto em estado, como a célula faz com `setImageWidth`. */
function Harness({ initial, onResize }: { initial: string; onResize?: (width: number) => void }) {
  const [texto, setTexto] = useState(initial);
  return (
    <>
      <MarkdownView
        texto={texto}
        studyId="ID"
        onResizeImage={(range, width) => {
          onResize?.(width);
          setTexto((current) => setImageWidth(current, range.start, range.end, width));
        }}
      />
      <output data-testid="texto">{texto}</output>
    </>
  );
}

describe("ImageResizer — no MarkdownView", () => {
  it("a alça só aparece com a imagem selecionada e com onResizeImage", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<MarkdownView texto="![foto](imagens/a.png)" studyId="ID" />);
    await user.click(screen.getByRole("img", { name: "foto" }));
    expect(screen.queryByRole("slider", { name: HANDLE })).not.toBeInTheDocument();
    unmount();

    render(<Harness initial="![foto](imagens/a.png)" />);
    expect(screen.queryByRole("slider", { name: HANDLE })).not.toBeInTheDocument();
    await user.click(screen.getByRole("img", { name: "foto" }));
    expect(screen.getByRole("slider", { name: HANDLE })).toBeInTheDocument();
  });

  it("arrastar a alça 120 px numa imagem de 300 px muda a largura exibida e reescreve só ao soltar", async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    render(<Harness initial="Antes ![foto](imagens/a.png) depois" onResize={onResize} />);
    await user.click(screen.getByRole("img", { name: "foto" }));
    const handle = screen.getByRole("slider", { name: HANDLE });

    drag(handle, 100, 220, null);
    expect(screen.getByRole("img", { name: "foto" })).toHaveAttribute("width", "420");
    expect(onResize).not.toHaveBeenCalled();
    expect(screen.getByTestId("texto")).toHaveTextContent("Antes ![foto](imagens/a.png) depois");

    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 220, clientY: 12 });
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(420);
    expect(screen.getByTestId("texto")).toHaveTextContent("Antes ![foto|420](imagens/a.png) depois");
    expect(screen.getByRole("img", { name: "foto" })).toHaveAttribute("width", "420");
  });

  it("o campo Largura com 450 + Enter chama onResize(450)", async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    render(<Harness initial="![foto|300](imagens/a.png)" onResize={onResize} />);
    await user.click(screen.getByRole("img", { name: "foto" }));
    const input = screen.getByLabelText("Largura");
    await user.clear(input);
    await user.type(input, "450{Enter}");
    expect(onResize).toHaveBeenCalledWith(450);
    expect(screen.getByTestId("texto")).toHaveTextContent("![foto|450](imagens/a.png)");
  });

  it("teclas + e - na imagem selecionada mudam 10 px", async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    render(<Harness initial="![foto|300](imagens/a.png)" onResize={onResize} />);
    // Sem seleção, + não faz nada.
    screen.getByRole("button", { name: "Imagem: foto" }).focus();
    await user.keyboard("+");
    expect(onResize).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    await user.keyboard("+");
    expect(onResize).toHaveBeenLastCalledWith(310);
    await user.keyboard("+");
    expect(onResize).toHaveBeenLastCalledWith(320);
    await user.keyboard("-");
    expect(onResize).toHaveBeenLastCalledWith(310);
    expect(screen.getByTestId("texto")).toHaveTextContent("![foto|310](imagens/a.png)");
    expect(screen.getByLabelText("Largura")).toHaveValue(310);
  });
});
