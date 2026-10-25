import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarkdownView } from "@/features/estudo/editor/components/MarkdownView";

const ID = "ID";

function view(texto: string, onResizeImage?: (range: { start: number; end: number }, width: number) => void) {
  return render(<MarkdownView texto={texto} studyId={ID} onResizeImage={onResizeImage} />);
}

describe("MarkdownView — GFM", () => {
  it("renderiza negrito, tabela, tachado e tarefa marcada somente leitura", () => {
    const texto = [
      "**negrito** e ~~tachado~~",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "- [x] tarefa",
    ].join("\n");
    const { container } = view(texto);

    expect(container.querySelector("strong")).toHaveTextContent("negrito");
    expect(container.querySelector("del")).toHaveTextContent("tachado");
    const table = container.querySelector("table");
    expect(table).toBeInTheDocument();
    // A tabela fica num contêiner que rola na horizontal.
    expect(table?.parentElement?.tagName).toBe("DIV");
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
  });
});

describe("MarkdownView — código", () => {
  it("colore o bloco com linguagem da cerca", () => {
    const { container } = view("```python\nprint(1)\n```");
    const code = container.querySelector("pre code");
    expect(code).toHaveClass("hljs");
    expect(code).toHaveClass("language-python");
    expect(code?.querySelector("[class^='hljs-']")).not.toBeNull();
  });

  it("aceita apelidos comuns (ts, sh, html)", () => {
    const { container } = view("```ts\nconst a: number = 1;\n```\n\n```sh\necho oi\n```\n\n```html\n<b>x</b>\n```");
    const codes = container.querySelectorAll("pre code");
    expect(codes).toHaveLength(3);
    codes.forEach((code) => expect(code.querySelector("[class^='hljs-']")).not.toBeNull());
  });

  it("não adivinha a linguagem de bloco sem cerca nomeada", () => {
    const { container } = view("```\nconst a = 1;\nprint(1)\n```");
    const code = container.querySelector("pre code");
    expect(code).toHaveTextContent("const a = 1;");
    expect(code?.querySelector("[class^='hljs-']")).toBeNull();
    expect(code?.className ?? "").not.toMatch(/hljs/);
  });
});

describe("MarkdownView — LaTeX", () => {
  it("renderiza fórmula em linha e em bloco com KaTeX", () => {
    const { container } = view("Em linha $x^2$.\n\n$$\n\\frac{a}{b}\n$$");
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector(".katex-display .katex")).not.toBeNull();
  });

  it("mostra fórmula inválida com erro visível, sem lançar", () => {
    const { container } = view("Antes $\\frac{$ depois");
    const error = container.querySelector(".katex-error");
    expect(error).not.toBeNull();
    expect(error).toHaveTextContent("\\frac{");
    expect(container.querySelector(".katex-display:empty")).toBeNull();
    expect(container).toHaveTextContent("Antes");
    expect(container).toHaveTextContent("depois");
  });
});

describe("MarkdownView — Markdown hostil", () => {
  it("mostra HTML cru como texto inerte", () => {
    const { container } = view("<script>alert(1)</script>\n\nTexto <img src=x onerror=alert(1)> fim");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("<script>alert(1)</script>");
    expect(container).toHaveTextContent("<img src=x onerror=alert(1)>");
  });

  it("não gera href com esquema perigoso", () => {
    const { container } = view(
      "[a](javascript:alert(1)) [b](data:text/html,x) [c](vbscript:x) [d](file:///C:/x) [e](https://ok.com)",
    );
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    for (const href of hrefs) {
      expect(href).not.toMatch(/^\s*(javascript|data|vbscript|file):/i);
    }
    expect(hrefs).toContain("https://ok.com");
    // O link bloqueado perde o href (vira texto), em vez de apontar para a própria página.
    expect(screen.getByText("a").closest("a")).not.toHaveAttribute("href");
  });

  it("não gera img com src perigoso e mostra o alt como texto", () => {
    const { container } = view(
      "![x1](data:image/png;base64,AA) ![x2](file:///C:/x.png) ![x3](javascript:alert(1)) ![x4](//evil.com/a.png) ![x5](imagens/../x.png)",
    );
    expect(container.querySelector("img")).toBeNull();
    for (const alt of ["x1", "x2", "x3", "x4", "x5"]) {
      expect(container).toHaveTextContent(alt);
    }
  });
});

describe("MarkdownView — imagens", () => {
  it("troca o caminho relativo pela rota do Estudo e aplica a largura do alt", () => {
    view("![foto|300](imagens/a.png)");
    const img = screen.getByRole("img", { name: "foto" });
    expect(img).toHaveAttribute("src", "/estudo/ID/imagens/a.png");
    expect(img).toHaveAttribute("alt", "foto");
    expect(img).toHaveAttribute("width", "300");
    expect(img).toHaveStyle({ maxWidth: "100%" });
  });

  it("sem |N mantém a largura natural limitada à célula", () => {
    view("![foto](https://x.com/a.png)");
    const img = screen.getByRole("img", { name: "foto" });
    expect(img).toHaveAttribute("src", "https://x.com/a.png");
    expect(img).not.toHaveAttribute("width");
    expect(img).toHaveStyle({ maxWidth: "100%" });
  });

  it("sem onResizeImage a imagem não é selecionável", async () => {
    const user = userEvent.setup();
    const { container } = view("![foto|300](imagens/a.png)");
    await user.click(screen.getByRole("img", { name: "foto" }));
    expect(container.querySelector("[aria-pressed]")).toBeNull();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("[tabindex]")).toBeNull();
    expect(screen.queryByLabelText("Largura")).not.toBeInTheDocument();
  });

  it("com onResizeImage, clicar seleciona e o campo Largura reescreve o trecho", async () => {
    const user = userEvent.setup();
    const onResizeImage = vi.fn();
    const token = "![foto|300](imagens/a.png)";
    const texto = `Antes\n\n${token}\n\nDepois`;
    const start = texto.indexOf(token);
    const end = start + token.length;
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <MarkdownView texto={texto} studyId={ID} onResizeImage={onResizeImage} />
      </div>,
    );

    expect(screen.queryByLabelText("Largura")).not.toBeInTheDocument();
    await user.click(screen.getByRole("img", { name: "foto" }));

    const wrapper = screen.getByRole("img", { name: "foto" }).parentElement;
    expect(wrapper).toHaveAttribute("aria-pressed", "true");
    expect(wrapper).toHaveAttribute("role", "button");
    expect(onParentClick).not.toHaveBeenCalled();
    const input = screen.getByLabelText("Largura");
    expect(input).toHaveValue(300);

    await user.clear(input);
    await user.type(input, "450{Enter}");
    expect(onResizeImage).toHaveBeenCalledTimes(1);
    expect(onResizeImage).toHaveBeenCalledWith({ start, end }, 450);
    expect(texto.slice(start, end)).toBe(token);

    // Sair do campo depois de confirmar não repete a chamada.
    await user.tab();
    expect(onResizeImage).toHaveBeenCalledTimes(1);
  });

  it("confirma a largura ao sair do campo e respeita os limites 32..2000", async () => {
    const user = userEvent.setup();
    const onResizeImage = vi.fn();
    view("![foto](imagens/a.png)", onResizeImage);
    await user.click(screen.getByRole("img", { name: "foto" }));
    const input = screen.getByLabelText("Largura");
    // Sem largura no texto e sem medida no jsdom, o campo mostra 300.
    expect(input).toHaveValue(300);
    await user.clear(input);
    await user.type(input, "5000");
    await user.tab();
    expect(onResizeImage).toHaveBeenCalledWith({ start: 0, end: "![foto](imagens/a.png)".length }, 2000);
  });

  it("seleciona pelo teclado com Enter ou Espaço", async () => {
    const user = userEvent.setup();
    view("![foto|120](imagens/a.png)", vi.fn());
    const wrapper = screen.getByRole("img", { name: "foto" }).parentElement as HTMLElement;
    expect(wrapper).toHaveAttribute("tabindex", "0");
    expect(wrapper).toHaveAttribute("aria-pressed", "false");
    wrapper.focus();
    await user.keyboard(" ");
    expect(wrapper).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Largura")).toHaveValue(120);
  });

  it("a imagem selecionável é um botão com nome Imagem: <alt> e estado pressionado", async () => {
    const user = userEvent.setup();
    view("![foto|120](imagens/a.png)", vi.fn());
    const button = screen.getByRole("button", { name: "Imagem: foto" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).not.toHaveAttribute("aria-selected");
    await user.keyboard("{Tab}{Enter}");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("imagem em estilo de referência não é selecionável", async () => {
    const user = userEvent.setup();
    const onResizeImage = vi.fn();
    view("Veja ![r][q]\n\n[q]: https://x.com/a.png", onResizeImage);
    const img = screen.getByRole("img", { name: "r" });
    expect(img).toHaveAttribute("src", "https://x.com/a.png");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await user.click(img);
    expect(screen.queryByLabelText("Largura")).not.toBeInTheDocument();
    expect(onResizeImage).not.toHaveBeenCalled();
  });

  it("imagem dentro de link seleciona em vez de navegar", () => {
    view("[![foto](imagens/a.png)](https://x.com)", vi.fn());
    const img = screen.getByRole("img", { name: "foto" });
    expect(img.closest("a")).toHaveAttribute("href", "https://x.com");
    // `fireEvent` devolve false quando o clique teve o padrão cancelado.
    expect(fireEvent.click(img)).toBe(false);
    expect(screen.getByRole("button", { name: "Imagem: foto" })).toHaveAttribute("aria-pressed", "true");
  });

  it("Esc tira a seleção e devolve o foco para a imagem", async () => {
    const user = userEvent.setup();
    view("![foto|120](imagens/a.png)", vi.fn());
    await user.click(screen.getByRole("img", { name: "foto" }));
    await user.click(screen.getByLabelText("Largura"));
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Largura")).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Imagem: foto" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(button).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("clicar fora tira a seleção; clicar no campo ou na alça, não", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <p>fora</p>
        <MarkdownView texto="![foto|120](imagens/a.png)" studyId={ID} onResizeImage={vi.fn()} />
      </div>,
    );
    await user.click(screen.getByRole("img", { name: "foto" }));
    await user.click(screen.getByLabelText("Largura"));
    fireEvent.pointerDown(screen.getByRole("slider", { name: "Redimensionar imagem" }), { pointerId: 1 });
    fireEvent.pointerUp(screen.getByRole("slider", { name: "Redimensionar imagem" }), { pointerId: 1 });
    expect(screen.getByLabelText("Largura")).toBeInTheDocument();

    await user.click(screen.getByText("fora"));
    expect(screen.queryByLabelText("Largura")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Imagem: foto" })).toHaveAttribute("aria-pressed", "false");
  });

  it("sem largura no texto, digitar o mesmo valor exibido e confirmar grava a largura", async () => {
    const user = userEvent.setup();
    const onResizeImage = vi.fn();
    view("![foto](imagens/a.png)", onResizeImage);
    await user.click(screen.getByRole("img", { name: "foto" }));
    const input = screen.getByLabelText("Largura");
    expect(input).toHaveValue(300);
    // Só focar e sair do campo não muda o texto.
    await user.click(input);
    await user.tab();
    expect(onResizeImage).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "300{Enter}");
    expect(onResizeImage).toHaveBeenCalledTimes(1);
    expect(onResizeImage).toHaveBeenCalledWith({ start: 0, end: "![foto](imagens/a.png)".length }, 300);
  });

  it("com largura no texto, confirmar o mesmo valor não reescreve", async () => {
    const user = userEvent.setup();
    const onResizeImage = vi.fn();
    view("![foto|300](imagens/a.png)", onResizeImage);
    await user.click(screen.getByRole("img", { name: "foto" }));
    const input = screen.getByLabelText("Largura");
    await user.clear(input);
    await user.type(input, "300{Enter}");
    expect(onResizeImage).not.toHaveBeenCalled();
  });
});

describe("MarkdownView — KaTeX sem avisos", () => {
  it("texto acentuado em fórmula não gera aviso no console", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { container } = view("Fórmula $ação = 1$ e $$\\text{função}$$");
      expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
