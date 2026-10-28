import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/usuarios" }));

import { Sidebar } from "@/components/layout/Sidebar";

function labels(isSuper: boolean) {
  render(<Sidebar id="sidebar" open={false} onNavigate={() => undefined} isSuper={isSuper} />);
  const links = within(screen.getByRole("navigation", { name: "Navegação principal" })).getAllByRole("link");
  return { links, texts: links.map((link) => link.textContent ?? "") };
}

describe("Sidebar", () => {
  it("sem isSuper não mostra Usuários", () => {
    const { texts } = labels(false);
    expect(texts.some((text) => text.includes("Usuários"))).toBe(false);
    expect(texts).toHaveLength(4);
  });

  it("com isSuper mostra Usuários logo depois de Configuração, apontando para /usuarios", () => {
    const { links, texts } = labels(true);
    const config = texts.findIndex((text) => text.includes("Configuração"));
    const users = texts.findIndex((text) => text.includes("Usuários"));
    expect(users).toBe(config + 1);
    expect(users).toBe(texts.length - 1);
    expect(links[users]).toHaveAttribute("href", "/usuarios");
    expect(links[users]).toHaveAttribute("aria-current", "page");
  });
});
