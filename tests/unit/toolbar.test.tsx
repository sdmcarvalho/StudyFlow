import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { Toolbar } from "@/features/estudo/editor/components/Toolbar";

type Props = ComponentProps<typeof Toolbar>;

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    mode: "default",
    onModeChange: vi.fn(),
    canFormat: true,
    onFormat: vi.fn(),
    onImage: vi.fn(),
    imageDisabled: false,
    state: { status: "idle", savedAt: null },
    onSave: vi.fn(),
    ...overrides,
  };
  const utils = render(<Toolbar {...props} />);
  return { ...utils, props };
}

const FORMAT_BUTTONS = [
  "Negrito",
  "Itálico",
  "Tachado",
  "Título",
  "Linha horizontal",
  "Lista com marcadores",
  "Lista numerada",
  "Lista de tarefas",
  "Citação",
  "Link",
  "Imagem",
  "Código",
  "Fórmula",
  "Tabela",
];
const OTHER_BUTTONS = ["Visualização dividida", "Visualização (preview)", "Salvar"];

describe("Toolbar — botões", () => {
  it("mostra todos os botões por nome acessível", () => {
    setup();
    for (const name of [...FORMAT_BUTTONS, ...OTHER_BUTTONS]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("com canFormat falso desabilita a formatação, mas não Salvar nem os modos", () => {
    setup({ canFormat: false });
    for (const name of FORMAT_BUTTONS) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    for (const name of OTHER_BUTTONS) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
  });

  it("Negrito chama onFormat('bold')", async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Negrito" }));
    expect(props.onFormat).toHaveBeenCalledWith("bold");
  });

  it("o menu Título abre e H2 chama onFormat('h2')", async () => {
    const { props } = setup();
    const trigger = screen.getByRole("button", { name: "Título" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "H1" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "H3" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitem", { name: "H2" }));
    expect(props.onFormat).toHaveBeenCalledWith("h2");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("o menu Título fecha com Esc e com clique fora", async () => {
    setup();
    const trigger = screen.getByRole("button", { name: "Título" });
    await userEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("Imagem chama onImage e fica desabilitado com imageDisabled", async () => {
    const { props, rerender } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Imagem" }));
    expect(props.onImage).toHaveBeenCalledTimes(1);

    rerender(<Toolbar {...props} imageDisabled />);
    expect(screen.getByRole("button", { name: "Imagem" })).toBeDisabled();
  });

  it("mousedown nos botões de formatação é cancelado (não tira o foco do texto)", () => {
    setup();
    for (const name of FORMAT_BUTTONS) {
      const button = screen.getByRole("button", { name });
      const allowed = fireEvent.mouseDown(button);
      expect(allowed, name).toBe(false);
    }
  });

  it("Salvar chama onSave", async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it("cada botão tem title", () => {
    setup();
    for (const name of [...FORMAT_BUTTONS, ...OTHER_BUTTONS]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("title");
    }
  });
});

describe("Toolbar — modos", () => {
  it("Visualização dividida alterna e volta ao padrão quando já ativa", async () => {
    const { props, rerender } = setup();
    const split = screen.getByRole("button", { name: "Visualização dividida" });
    expect(split).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(split);
    expect(props.onModeChange).toHaveBeenLastCalledWith("split");

    rerender(<Toolbar {...props} mode="split" />);
    expect(screen.getByRole("button", { name: "Visualização dividida" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Visualização dividida" }));
    expect(props.onModeChange).toHaveBeenLastCalledWith("default");
  });

  it("Visualização (preview) alterna e volta ao padrão quando já ativa", async () => {
    const { props, rerender } = setup();
    const preview = screen.getByRole("button", { name: "Visualização (preview)" });
    expect(preview).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(preview);
    expect(props.onModeChange).toHaveBeenLastCalledWith("preview");

    rerender(<Toolbar {...props} mode="preview" />);
    expect(screen.getByRole("button", { name: "Visualização (preview)" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Visualização (preview)" }));
    expect(props.onModeChange).toHaveBeenLastCalledWith("default");
  });
});

describe("Toolbar — indicador de salvamento", () => {
  it("mostra o texto de cada estado", () => {
    const { props, rerender } = setup();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(/^$/);

    rerender(<Toolbar {...props} state={{ status: "dirty", savedAt: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("● Alterações não salvas");

    rerender(<Toolbar {...props} state={{ status: "saving", savedAt: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Salvando…");

    rerender(<Toolbar {...props} state={{ status: "saved", savedAt: new Date(2026, 9, 25, 10, 42) }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Salvo às 10:42");

    rerender(<Toolbar {...props} state={{ status: "saved", savedAt: new Date(2026, 9, 25, 9, 5) }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Salvo às 09:05");

    rerender(<Toolbar {...props} state={{ status: "retrying", savedAt: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Falha ao salvar. Tentando de novo…");

    rerender(<Toolbar {...props} state={{ status: "failed", savedAt: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Não salvo");
  });
});
