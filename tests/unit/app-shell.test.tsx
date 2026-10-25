import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/estudo" }));

import { AppShell } from "@/components/layout/AppShell";

function setup() {
  render(
    <AppShell>
      <p>Conteúdo</p>
    </AppShell>,
  );
  return {
    toggle: () => screen.getByRole("button", { name: /menu/i }),
  };
}

afterEach(() => {
  document.body.style.overflow = "";
});

describe("AppShell", () => {
  it("renderiza o conteúdo e os três itens do menu", () => {
    setup();
    expect(screen.getByText("Conteúdo")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(nav).toHaveTextContent("Estudo");
    expect(nav).toHaveTextContent("Testes");
    expect(nav).toHaveTextContent("Agenda");
  });

  it("marca só o item da rota atual com aria-current", () => {
    setup();
    expect(screen.getByRole("link", { name: /Estudo/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Testes/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /Agenda/ })).not.toHaveAttribute("aria-current");
  });

  it("os links apontam para /estudo, /testes e /agenda", () => {
    setup();
    expect(screen.getByRole("link", { name: /Estudo/ })).toHaveAttribute("href", "/estudo");
    expect(screen.getByRole("link", { name: /Testes/ })).toHaveAttribute("href", "/testes");
    expect(screen.getByRole("link", { name: /Agenda/ })).toHaveAttribute("href", "/agenda");
  });

  it("o botão alterna 'Abrir menu'/'Fechar menu', aria-expanded e o scroll do body", async () => {
    const { toggle } = setup();
    expect(toggle()).toHaveAttribute("aria-label", "Abrir menu");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-label", "Fechar menu");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(document.body.style.overflow).toBe("hidden");

    await userEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(document.body.style.overflow).toBe("");
  });

  it("Escape fecha o drawer", async () => {
    const { toggle } = setup();
    await userEvent.click(toggle());
    await userEvent.keyboard("{Escape}");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("clicar no overlay fecha o drawer", async () => {
    const { toggle } = setup();
    await userEvent.click(toggle());
    await userEvent.click(screen.getByTestId("sidebar-overlay"));
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("clicar num item do menu fecha o drawer", async () => {
    const { toggle } = setup();
    await userEvent.click(toggle());
    await userEvent.click(screen.getByRole("link", { name: /Testes/ }));
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("redimensionar para 768px ou mais fecha o drawer", async () => {
    const { toggle } = setup();
    await userEvent.click(toggle());
    act(() => {
      window.innerWidth = 1024;
      window.dispatchEvent(new Event("resize"));
    });
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });
});
