import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/actions", () => ({ logoutAction: vi.fn() }));

import { UserMenu } from "@/features/auth/components/UserMenu";

describe("UserMenu", () => {
  it("mostra o nome e guarda o e-mail no title", () => {
    render(<UserMenu name="Ana Souza" email="ana@x.com" />);
    const name = screen.getByText("Ana Souza");
    expect(name).toBeInTheDocument();
    expect(name).toHaveAttribute("title", "ana@x.com");
  });

  it("tem o botão Sair dentro de um formulário", () => {
    render(<UserMenu name="Ana Souza" email="ana@x.com" />);
    const button = screen.getByRole("button", { name: "Sair" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button.closest("form")).not.toBeNull();
  });
});
