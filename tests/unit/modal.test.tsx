import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/ui/Modal";

function setup(open = true, onClose = vi.fn()) {
  return {
    onClose,
    ui: (isOpen: boolean) => (
      <>
        <button>Abrir</button>
        <Modal open={isOpen} title="Novo registro" onClose={onClose}>
          <input aria-label="Descrição" />
          <button>Salvar</button>
        </Modal>
      </>
    ),
    open,
  };
}

describe("Modal", () => {
  it("não renderiza quando open é false", () => {
    const { ui } = setup();
    render(ui(false));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("liga o título por aria-labelledby e marca aria-modal", () => {
    const { ui } = setup();
    render(ui(true));
    const dialog = screen.getByRole("dialog", { name: "Novo registro" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("chama onClose com Escape", async () => {
    const { ui, onClose } = setup();
    render(ui(true));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("chama onClose ao clicar no overlay, mas não ao clicar dentro do painel", async () => {
    const { ui, onClose } = setup();
    render(ui(true));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(screen.getByLabelText("Descrição"));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("foca o primeiro campo ao abrir", () => {
    const { ui } = setup();
    render(ui(true));
    expect(screen.getByLabelText("Descrição")).toHaveFocus();
  });

  it("foca o initialFocusRef quando informado", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Modal open title="Excluir registro" onClose={() => {}} role="alertdialog" initialFocusRef={ref}>
        <button>Cancelar</button>
        <button ref={ref}>Excluir</button>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Excluir" })).toHaveFocus();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("devolve o foco ao elemento anterior ao fechar", () => {
    const { ui } = setup();
    const { rerender } = render(ui(false));
    const trigger = screen.getByRole("button", { name: "Abrir" });
    trigger.focus();
    rerender(ui(true));
    expect(screen.getByLabelText("Descrição")).toHaveFocus();
    rerender(ui(false));
    expect(trigger).toHaveFocus();
  });
});
