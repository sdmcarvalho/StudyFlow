import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/actions", () => ({ changePasswordAction: vi.fn() }));

import { changePasswordAction } from "@/features/auth/actions";
import { ChangePasswordForm } from "@/features/auth/components/ChangePasswordForm";

type ChangeResult = Awaited<ReturnType<typeof changePasswordAction>>;

beforeEach(() => {
  vi.mocked(changePasswordAction).mockReset();
});

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Senha atual"), "Senha1234");
  await user.type(screen.getByLabelText("Nova senha"), "NovaSenha99");
  await user.type(screen.getByLabelText("Confirmar nova senha"), "NovaSenha99");
  await user.click(screen.getByRole("button", { name: "Alterar senha" }));
}

describe("ChangePasswordForm", () => {
  it("tem o título Minha conta e três campos de senha com autocomplete correto", () => {
    render(<ChangePasswordForm />);

    expect(screen.getByRole("heading", { name: "Minha conta" })).toBeInTheDocument();
    const atual = screen.getByLabelText("Senha atual");
    const nova = screen.getByLabelText("Nova senha");
    const confirmacao = screen.getByLabelText("Confirmar nova senha");
    for (const field of [atual, nova, confirmacao]) expect(field).toHaveAttribute("type", "password");
    expect(atual).toHaveAttribute("autocomplete", "current-password");
    expect(nova).toHaveAttribute("autocomplete", "new-password");
    expect(confirmacao).toHaveAttribute("autocomplete", "new-password");
  });

  it("envia os três campos para a action", async () => {
    const user = userEvent.setup();
    vi.mocked(changePasswordAction).mockResolvedValue({ ok: false, message: "x" });
    render(<ChangePasswordForm />);

    await fillAndSubmit(user);

    expect(changePasswordAction).toHaveBeenCalledWith({
      senhaAtual: "Senha1234",
      novaSenha: "NovaSenha99",
      confirmacao: "NovaSenha99",
    });
  });

  it("mostra os erros por campo ligados ao campo (aria-invalid e aria-describedby)", async () => {
    const user = userEvent.setup();
    vi.mocked(changePasswordAction).mockResolvedValue({
      ok: false,
      fieldErrors: {
        senhaAtual: "Senha atual incorreta.",
        novaSenha: "Use pelo menos um número.",
        confirmacao: "A confirmação não confere com a nova senha.",
      },
    });
    render(<ChangePasswordForm />);

    await fillAndSubmit(user);

    const atual = screen.getByLabelText("Senha atual");
    const nova = screen.getByLabelText("Nova senha");
    const confirmacao = screen.getByLabelText("Confirmar nova senha");
    await waitFor(() => expect(atual).toHaveAttribute("aria-invalid", "true"));
    expect(nova).toHaveAttribute("aria-invalid", "true");
    expect(confirmacao).toHaveAttribute("aria-invalid", "true");
    expect(atual).toHaveAccessibleDescription("Senha atual incorreta.");
    expect(nova).toHaveAccessibleDescription("Use pelo menos um número.");
    expect(confirmacao).toHaveAccessibleDescription("A confirmação não confere com a nova senha.");
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    // Em caso de erro, o que foi digitado continua nos campos para corrigir.
    expect(atual).toHaveValue("Senha1234");
  });

  it("mostra a mensagem geral do servidor", async () => {
    const user = userEvent.setup();
    vi.mocked(changePasswordAction).mockResolvedValue({ ok: false, message: "Sessão expirada, entre novamente." });
    render(<ChangePasswordForm />);

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Sessão expirada, entre novamente.");
  });

  it("no sucesso limpa os três campos e mostra o aviso de sucesso", async () => {
    const user = userEvent.setup();
    vi.mocked(changePasswordAction).mockResolvedValue({ ok: true, data: undefined });
    render(<ChangePasswordForm />);

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByLabelText("Senha atual")).toHaveValue(""));
    expect(screen.getByLabelText("Nova senha")).toHaveValue("");
    expect(screen.getByLabelText("Confirmar nova senha")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Senha alterada.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alterar senha" })).toBeEnabled();
  });

  it("desabilita o botão durante o envio", async () => {
    const user = userEvent.setup();
    let resolve!: (value: ChangeResult) => void;
    vi.mocked(changePasswordAction).mockReturnValue(new Promise<ChangeResult>((r) => (resolve = r)));
    render(<ChangePasswordForm />);

    await fillAndSubmit(user);

    expect(screen.getByRole("button", { name: "Alterar senha" })).toBeDisabled();
    resolve({ ok: false, message: "falhou" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Alterar senha" })).toBeEnabled());
  });

  it("se o servidor falhar, mostra uma mensagem e libera o botão", async () => {
    const user = userEvent.setup();
    vi.mocked(changePasswordAction).mockRejectedValue(new Error("boom"));
    render(<ChangePasswordForm />);

    await fillAndSubmit(user);

    expect(await screen.findByText("Não foi possível alterar a senha. Tente novamente.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alterar senha" })).toBeEnabled();
  });
});
